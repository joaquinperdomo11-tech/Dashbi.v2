import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, adsCampaigns, adsItemsSnapshot } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";
import { resolverAdvertiser } from "@/lib/adsAdvertiser";

async function getAccessToken(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) return null;
    accessToken = refreshed.access_token;
    await db
      .update(mlTokens)
      .set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        updatedAt: new Date(),
      })
      .where(eq(mlTokens.tenantId, tenant.id));
  }
  return accessToken;
}

const METRICS = [
  "clicks",
  "prints",
  "ctr",
  "cost",
  "cpc",
  "acos",
  "cvr",
  "roas",
  "units_quantity",
  "direct_amount",
  "indirect_amount",
  "total_amount",
].join(",");

// Elige la campaña activa menos-recientemente-sincronizada (de cualquier
// tenant), mismo patrón que sync-publicaciones. Trae TODOS sus anuncios
// paginando dentro de este mismo request (un catálogo típico por campaña
// entra en pocas páginas de 50 — no amerita cursor entre invocaciones).
// Corre 1 vez por día vía cron-job.org.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await syncAdsItems();
  } catch (e) {
    console.error("sync-ads-items falló:", e);
    return NextResponse.json({ ok: false, error: "unexpected_error", detail: String(e) }, { status: 500 });
  }
}

async function syncAdsItems() {
  // Trae todas las campañas activas y elige en JS la menos-recientemente-
  // sincronizada (nunca sincronizada = primera). Se evita un ORDER BY con
  // SQL crudo acá — causaba un error de tipos con el driver de Neon.
  const campañasActivas = await db
    .select()
    .from(adsCampaigns)
    .where(eq(adsCampaigns.status, "active"));

  if (campañasActivas.length === 0) {
    return NextResponse.json({ ok: true, message: "No hay campañas activas para sincronizar" });
  }

  campañasActivas.sort((a, b) => {
    const at = a.itemsLastSyncedAt ? new Date(a.itemsLastSyncedAt).getTime() : -Infinity;
    const bt = b.itemsLastSyncedAt ? new Date(b.itemsLastSyncedAt).getTime() : -Infinity;
    return at - bt;
  });
  const campaña = campañasActivas[0];

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, campaña.tenantId));
  if (!tenant) return NextResponse.json({ ok: false, error: "Tenant no encontrado" });

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  const advertiser = await resolverAdvertiser(tenant.id, accessToken);
  if (!advertiser) return NextResponse.json({ ok: true, message: "Product Ads no habilitado" });

  const hoy = new Date();
  const hace7 = new Date(hoy.getTime() - 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let offset = 0;
  const limit = 50;
  let total = Infinity;
  let procesados = 0;

  while (offset < total && offset < 500) {
    // tope de 500 ítems por campaña por invocación, por las dudas — un
    // catálogo así de grande en una sola campaña es un caso extremo
    const url =
      `https://api.mercadolibre.com/marketplace/advertising/${advertiser.siteId}/advertisers/${advertiser.advertiserId}/product_ads/ads/search` +
      `?limit=${limit}&offset=${offset}&date_from=${fmt(hace7)}&date_to=${fmt(hoy)}&metrics=${METRICS}` +
      `&filters[campaign_id]=${campaña.campaignId}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Api-Version": "2" },
    });
    if (!res.ok) break;

    const data = await res.json().catch(() => null);
    const results: Array<Record<string, unknown>> = data?.results ?? [];
    total = data?.paging?.total ?? results.length;

    for (const item of results) {
      const metrics = (item.metrics as Record<string, number>) ?? {};
      const values = {
        tenantId: tenant.id,
        campaignId: String(campaña.campaignId),
        itemId: String(item.item_id),
        title: item.title ? String(item.title) : null,
        price: item.price !== undefined ? String(item.price) : null,
        status: item.status ? String(item.status) : null,
        clicks: metrics.clicks ?? 0,
        prints: metrics.prints ?? 0,
        cost: String(metrics.cost ?? 0),
        cpc: String(metrics.cpc ?? 0),
        ctr: String(metrics.ctr ?? 0),
        directAmount: String(metrics.direct_amount ?? 0),
        indirectAmount: String(metrics.indirect_amount ?? 0),
        totalAmount: String(metrics.total_amount ?? 0),
        unitsQuantity: metrics.units_quantity ?? 0,
        acos: String(metrics.acos ?? 0),
        cvr: String(metrics.cvr ?? 0),
        roas: String(metrics.roas ?? 0),
        updatedAt: new Date(),
      };

      await db
        .insert(adsItemsSnapshot)
        .values(values)
        .onConflictDoUpdate({
          target: [adsItemsSnapshot.tenantId, adsItemsSnapshot.itemId],
          set: values,
        });
      procesados++;
    }

    offset += limit;
    if (results.length === 0) break;
  }

  await db
    .update(adsCampaigns)
    .set({ itemsLastSyncedAt: new Date() })
    .where(and(eq(adsCampaigns.tenantId, campaña.tenantId), eq(adsCampaigns.campaignId, campaña.campaignId)));

  return NextResponse.json({ ok: true, campaña: campaña.name, itemsSincronizados: procesados });
}
