import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

const BATCH_SIZE = 20; // items per call, well under Vercel/cron timeout

async function getAccessToken(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) return null;
    accessToken = refreshed.access_token;
    await db.update(mlTokens).set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(mlTokens.tenantId, tenant.id));
  }
  return accessToken;
}

// Process ONE tenant, ONE batch of items per call.
// Progress is tracked via ml_tokens.updatedAt marker approach won't work here,
// so we store cursor state in-memory per call using query params, cycling
// through tenants round-robin: each cron tick advances exactly one tenant by one batch.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));

  // Pick ONE tenant per invocation, rotating by minute so all tenants get covered over time
  const eligible = activeTenants.filter(t => t.mlUserId);
  if (eligible.length === 0) return NextResponse.json({ ok: true, message: "No tenants" });

  const minuteSlot = Math.floor(Date.now() / 60000);
  const tenant = eligible[minuteSlot % eligible.length];

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token for selected tenant" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  // Get item IDs (cheap call, paginated internally but fast — search endpoint is lightweight)
  let itemIds: string[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `https://api.mercadolibre.com/users/${tenant.mlUserId}/items/search?limit=100&offset=${offset}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!data.results?.length) break;
    itemIds = itemIds.concat(data.results);
    if (itemIds.length >= (data.paging?.total || 0)) break;
    offset += 100;
    if (offset > 2000) break; // safety cap
  }

  if (itemIds.length === 0) {
    return NextResponse.json({ ok: true, tenantId: tenant.id, synced: 0, total: 0 });
  }

  // Determine which batch to process this tick, based on a rotating offset within this tenant
  const batchSlot = Math.floor(Date.now() / 15000); // changes every 15s
  const totalBatches = Math.ceil(itemIds.length / BATCH_SIZE);
  const batchIndex = batchSlot % totalBatches;
  const batchStart = batchIndex * BATCH_SIZE;
  const batch = itemIds.slice(batchStart, batchStart + BATCH_SIZE);

  let synced = 0;
  const res = await fetch(
    `https://api.mercadolibre.com/items?ids=${batch.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();

  if (Array.isArray(data)) {
    for (const r of data) {
      if (r.code !== 200 || !r.body) continue;
      const item = r.body;
      const skuAttr = (item.attributes || []).find((a: any) => a.id === "SELLER_SKU");
      const sku = skuAttr?.value_name || item.seller_custom_field || "";
      const freeShipping = !!item.shipping?.free_shipping;

      try {
        await db.insert(publicaciones).values({
          tenantId: tenant.id,
          itemId: item.id,
          sku,
          title: item.title || "",
          thumbnail: item.thumbnail || "",
          price: String(item.price || 0),
          availableQuantity: item.available_quantity || 0,
          status: item.status || "closed",
          soldQuantity: item.sold_quantity || 0,
          freeShipping,
        }).onConflictDoUpdate({
          target: [publicaciones.tenantId, publicaciones.itemId],
          set: {
            sku, title: item.title || "", thumbnail: item.thumbnail || "",
            price: String(item.price || 0), availableQuantity: item.available_quantity || 0,
            status: item.status || "closed", soldQuantity: item.sold_quantity || 0,
            freeShipping,
          },
        });
        synced++;
      } catch (e) {
        console.error("Insert publicacion error:", e);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    tenantId: tenant.id,
    batchIndex,
    totalBatches,
    synced,
    totalItems: itemIds.length,
  });
}
