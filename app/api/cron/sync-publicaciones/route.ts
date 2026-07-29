import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones, syncCursors } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

const BATCH_SIZE = 20;
const SYNC_TYPE = "publicaciones";
const REFRESH_ITEM_IDS_AFTER_MS = 60 * 60 * 1000; // re-fetch full id list once per hour

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

// Resuelve category_id -> nombre legible. Endpoint público de ML (no requiere auth).
// Se llama solo para los category_ids únicos presentes en el batch actual (normalmente
// muy pocos, muchos items comparten categoría), así que no agrega loops largos.
async function resolveCategoryNames(categoryIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  await Promise.all(categoryIds.map(async (catId) => {
    try {
      const res = await fetch(`https://api.mercadolibre.com/categories/${catId}`);
      const data = await res.json();
      if (data?.name) names.set(catId, data.name);
    } catch (e) {
      console.error("Error fetching category name:", catId, e);
    }
  }));
  return names;
}

// Each invocation: pick ONE tenant (round robin, least-recently-processed first),
// process ONE batch of items for it, persist cursor. Fast — always under a few seconds.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));
  const eligible = activeTenants.filter(t => t.mlUserId);
  if (eligible.length === 0) return NextResponse.json({ ok: true, message: "No tenants" });

  // Pick the tenant whose cursor was updated longest ago (or never)
  const cursors = await db.select().from(syncCursors).where(eq(syncCursors.syncType, SYNC_TYPE));
  const cursorByTenant = new Map(cursors.map(c => [c.tenantId, c]));

  const sorted = [...eligible].sort((a, b) => {
    const ca = cursorByTenant.get(a.id)?.updatedAt?.getTime() || 0;
    const cb = cursorByTenant.get(b.id)?.updatedAt?.getTime() || 0;
    return ca - cb;
  });
  const tenant = sorted[0];
  const cursor = cursorByTenant.get(tenant.id);

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  let itemIds: string[] = [];
  const hasCache = cursor?.itemIds && cursor.itemIds !== "[]";

  if (!hasCache) {
    // No cached list yet — fetch just the FIRST page (100 items) to get started fast.
    // A separate lightweight endpoint (refresh-item-list) completes the full list over time.
    const res = await fetch(
      `https://api.mercadolibre.com/users/${tenant.mlUserId}/items/search?limit=100&offset=0`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    itemIds = data.results || [];

    await db.insert(syncCursors).values({
      tenantId: tenant.id,
      syncType: SYNC_TYPE,
      itemIds: JSON.stringify(itemIds),
      cursorPosition: 0,
      lastFullSync: itemIds.length < 100 ? new Date() : null, // only mark complete if this was the whole list
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [syncCursors.tenantId, syncCursors.syncType],
      set: { itemIds: JSON.stringify(itemIds), cursorPosition: 0, updatedAt: new Date() },
    });
  } else {
    itemIds = JSON.parse(cursor!.itemIds || "[]");
  }

  if (itemIds.length === 0) {
    return NextResponse.json({ ok: true, tenantId: tenant.id, synced: 0, total: 0 });
  }

  let position = cursor?.cursorPosition || 0;
  if (position >= itemIds.length) position = 0; // wrap around, start a new full pass

  const batch = itemIds.slice(position, position + BATCH_SIZE);
  const nextPosition = position + BATCH_SIZE;

  let synced = 0;
  const res = await fetch(
    `https://api.mercadolibre.com/items?ids=${batch.join(",")}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();

  if (Array.isArray(data)) {
    // Resolver category_id -> category_name para los IDs únicos de este batch,
    // así evitamos un fetch por item (muchos items suelen compartir categoría).
    const categoryIds = Array.from(new Set(
      data
        .filter((r: any) => r.code === 200 && r.body?.category_id)
        .map((r: any) => r.body.category_id as string)
    ));
    const categoryNames = await resolveCategoryNames(categoryIds);

    for (const r of data) {
      if (r.code !== 200 || !r.body) continue;
      const item = r.body;
      const skuAttr = (item.attributes || []).find((a: any) => a.id === "SELLER_SKU");
      const sku = skuAttr?.value_name || item.seller_custom_field || "";
      const freeShipping = !!item.shipping?.free_shipping;
      const categoryId = item.category_id || "";
      const categoryName = categoryId ? (categoryNames.get(categoryId) || "") : "";

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
          categoryId,
          categoryName,
        }).onConflictDoUpdate({
          target: [publicaciones.tenantId, publicaciones.itemId],
          set: {
            sku, title: item.title || "", thumbnail: item.thumbnail || "",
            price: String(item.price || 0), availableQuantity: item.available_quantity || 0,
            status: item.status || "closed", soldQuantity: item.sold_quantity || 0,
            freeShipping, categoryId, categoryName,
          },
        });
        synced++;
      } catch (e) {
        console.error("Insert publicacion error:", e);
      }
    }
  }

  await db.update(syncCursors).set({
    cursorPosition: nextPosition,
    updatedAt: new Date(),
  }).where(and(eq(syncCursors.tenantId, tenant.id), eq(syncCursors.syncType, SYNC_TYPE)));

  return NextResponse.json({
    ok: true,
    tenantId: tenant.id,
    synced,
    position,
    nextPosition,
    totalItems: itemIds.length,
  });
}
