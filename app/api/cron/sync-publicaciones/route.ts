import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function syncTenantPublicaciones(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
  let accessToken = token.accessToken;

  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) return { tenantId: tenant.id, error: "refresh_failed" };
    accessToken = refreshed.access_token;
    await db.update(mlTokens).set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(mlTokens.tenantId, tenant.id));
  }

  // Get all item IDs for this seller
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
  }

  let synced = 0;

  // Fetch item details in batches of 20
  for (let i = 0; i < itemIds.length; i += 20) {
    const batch = itemIds.slice(i, i + 20);
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
  }

  return { tenantId: tenant.id, synced };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));

  const results = [];
  for (const tenant of activeTenants) {
    if (!tenant.mlUserId) continue;
    const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
    if (!token) continue;
    const result = await syncTenantPublicaciones(tenant, token);
    results.push(result);
  }

  return NextResponse.json({ ok: true, synced: results });
}
