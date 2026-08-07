import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, adsCampaigns } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
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

// Rotación por tenant (1 por invocación), mismo patrón que sync-reputacion /
// sync-visitas — evita loops largos y timeouts, sin importar cuántos
// tenants haya. Corre 1 vez por día vía cron-job.org.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db
    .select()
    .from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));
  const eligible = activeTenants.filter((t) => t.mlUserId);
  if (eligible.length === 0) return NextResponse.json({ ok: true, message: "No tenants" });

  const daySlot = Math.floor(Date.now() / 86400000);
  const tenant = eligible[daySlot % eligible.length];

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  const advertiser = await resolverAdvertiser(tenant.id, accessToken);
  if (!advertiser) {
    return NextResponse.json({ ok: true, message: "Product Ads no habilitado o error al resolver advertiser" });
  }

  const hoy = new Date();
  const hace7 = new Date(hoy.getTime() - 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const url =
    `https://api.mercadolibre.com/marketplace/advertising/${advertiser.siteId}/advertisers/${advertiser.advertiserId}/product_ads/campaigns/search` +
    `?limit=50&offset=0&date_from=${fmt(hace7)}&date_to=${fmt(hoy)}&metrics=${METRICS}&aggregation_type=CAMPAIGN`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "Api-Version": "2" },
  });
  if (!res.ok) {
    return NextResponse.json({ ok: false, error: `ML respondió ${res.status}` });
  }
  const data = await res.json().catch(() => null);
  const results: Array<Record<string, unknown>> = data?.results ?? [];

  for (const c of results) {
    const metrics = (c.metrics as Record<string, number>) ?? {};
    await db
      .insert(adsCampaigns)
      .values({
        tenantId: tenant.id,
        campaignId: String(c.id),
        name: String(c.name ?? ""),
        status: String(c.status ?? ""),
        strategy: c.strategy ? String(c.strategy) : null,
        acosTarget: c.acos_target !== undefined ? String(c.acos_target) : null,
        roasTarget: c.roas_target !== undefined ? String(c.roas_target) : null,
        budget: c.budget !== undefined ? String(c.budget) : null,
        automaticBudget: Boolean(c.automatic_budget),
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
      })
      .onConflictDoUpdate({
        target: [adsCampaigns.tenantId, adsCampaigns.campaignId],
        set: {
          name: String(c.name ?? ""),
          status: String(c.status ?? ""),
          strategy: c.strategy ? String(c.strategy) : null,
          acosTarget: c.acos_target !== undefined ? String(c.acos_target) : null,
          roasTarget: c.roas_target !== undefined ? String(c.roas_target) : null,
          budget: c.budget !== undefined ? String(c.budget) : null,
          automaticBudget: Boolean(c.automatic_budget),
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
        },
      });
  }

  return NextResponse.json({ ok: true, tenant: tenant.id, campañas: results.length });
}
