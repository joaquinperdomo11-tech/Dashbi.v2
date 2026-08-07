import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function getTenant(userId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  return tenant;
}

async function getAccessToken(tenantId: string, token: typeof mlTokens.$inferSelect) {
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
      .where(eq(mlTokens.tenantId, tenantId));
  }
  return accessToken;
}

/**
 * Endpoint de debug TEMPORAL — borrar una vez confirmado el acceso a la
 * Advertising API y la forma real de los datos (mismo patrón usado para
 * los bugs de reputación y visitas).
 *
 * Qué hace:
 * 1. Consulta /advertising/advertisers?product_id=PADS para ver si Product
 *    Ads está activado en la cuenta ML del tenant logueado y obtener el
 *    advertiser_id.
 *    - Si devuelve 404 → Product Ads no está activo, hay que activarlo
 *      manualmente desde Mercado Libre > Gestión de publicaciones > Campaña
 *      de publicidad.
 * 2. Si hay advertiser_id, trae una muestra chica (5) de campañas con
 *    métricas de los últimos 7 días para inspeccionar la forma real del
 *    JSON antes de diseñar el schema y el cron definitivos.
 *
 * Devuelve el JSON crudo de ambas respuestas — no transforma nada.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) {
    return NextResponse.json(
      { error: "No hay token de ML — conectá tu cuenta de MercadoLibre primero" },
      { status: 400 }
    );
  }

  const accessToken = await getAccessToken(tenant.id, token);
  if (!accessToken) {
    return NextResponse.json({ error: "refresh_failed" }, { status: 500 });
  }

  const result: Record<string, unknown> = {};

  // 1. ¿Product Ads activado? Trae el/los advertiser_id disponibles.
  let advertisersRes: Response;
  try {
    advertisersRes = await fetch(
      "https://api.mercadolibre.com/advertising/advertisers?product_id=PADS",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Api-Version": "1",
        },
      }
    );
  } catch (e) {
    return NextResponse.json({ error: "fetch_failed", detail: String(e) }, { status: 500 });
  }

  const advertisersStatus = advertisersRes.status;
  const advertisersData = await advertisersRes.json().catch(() => null);
  result.advertisersStatus = advertisersStatus;
  result.advertisersData = advertisersData;

  if (advertisersStatus === 404) {
    result.diagnostico =
      "404: Product Ads no está activado en esta cuenta de ML. Hay que activarlo " +
      "manualmente desde Mercado Libre > Gestión de publicaciones > Campaña de publicidad, " +
      "y volver a llamar a este endpoint.";
    return NextResponse.json(result);
  }

  if (!advertisersRes.ok) {
    result.diagnostico = `Respuesta no-OK inesperada (status ${advertisersStatus}). Ver advertisersData.`;
    return NextResponse.json(result);
  }

  const advertiserId = advertisersData?.advertisers?.[0]?.advertiser_id;
  const siteId = advertisersData?.advertisers?.[0]?.site_id;
  if (!advertiserId || !siteId) {
    result.diagnostico =
      "No se encontró advertiser_id o site_id en la respuesta — revisar advertisersData completo.";
    return NextResponse.json(result);
  }
  result.advertiserId = advertiserId;
  result.siteId = siteId;

  // 2. Muestra chica de campañas + métricas de los últimos 7 días.
  // NOTA: ML migró este endpoint — ahora vive bajo /marketplace/advertising/{site_id}/...
  // y requiere /search al final. La ruta vieja (/advertising/advertisers/{id}/product_ads/campaigns)
  // devuelve 404 aunque el advertiser exista.
  const hoy = new Date();
  const hace7 = new Date(hoy.getTime() - 7 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD, formato que espera ML

  const metrics = [
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

  const campaignsUrl =
    `https://api.mercadolibre.com/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search` +
    `?limit=5&offset=0&date_from=${fmt(hace7)}&date_to=${fmt(hoy)}&metrics=${metrics}&aggregation_type=DAILY`;

  let campaignsRes: Response;
  try {
    campaignsRes = await fetch(campaignsUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Api-Version": "2",
      },
    });
  } catch (e) {
    result.campaignsError = String(e);
    return NextResponse.json(result);
  }

  result.campaignsDailyUrl = campaignsUrl;
  result.campaignsDailyStatus = campaignsRes.status;
  result.campaignsDailyData = await campaignsRes.json().catch(() => null);
  // ^ Esto ya lo confirmamos: con aggregation_type=DAILY, ML agrega TODA la
  // cuenta por día (no separa por campaña ni por producto). Sirve para un
  // gráfico de evolución diaria, pero no para recomendaciones por campaña/SKU.

  // 3. aggregation_type=CAMPAIGN — para ver si esto sí desglosa por campaña
  // individual (con campaign_id) en vez de agregar toda la cuenta.
  const campaignAggUrl =
    `https://api.mercadolibre.com/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search` +
    `?limit=10&offset=0&date_from=${fmt(hace7)}&date_to=${fmt(hoy)}&metrics=${metrics}&aggregation_type=CAMPAIGN`;
  try {
    const r = await fetch(campaignAggUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, "Api-Version": "2" },
    });
    result.campaignsByCampaignUrl = campaignAggUrl;
    result.campaignsByCampaignStatus = r.status;
    result.campaignsByCampaignData = await r.json().catch(() => null);
  } catch (e) {
    result.campaignsByCampaignError = String(e);
  }

  // 4. Metadata de campañas SIN fechas/métricas — para ver si trae
  // name/status/acos_target/budget/strategy por campaña (metadata pura).
  const metadataUrl =
    `https://api.mercadolibre.com/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search` +
    `?limit=10&offset=0`;
  try {
    const r = await fetch(metadataUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, "Api-Version": "2" },
    });
    result.campaignsMetadataUrl = metadataUrl;
    result.campaignsMetadataStatus = r.status;
    result.campaignsMetadataData = await r.json().catch(() => null);
  } catch (e) {
    result.campaignsMetadataError = String(e);
  }

  // 5. Endpoint de ítems/anuncios — para el desglose por producto/SKU,
  // clave para cruzar con margen real. Probamos la ruta migrada equivalente
  // a la de campañas (con /search bajo /marketplace/advertising/{site_id}/...).
  const itemsUrl =
    `https://api.mercadolibre.com/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads/items/search` +
    `?limit=10&offset=0&date_from=${fmt(hace7)}&date_to=${fmt(hoy)}&metrics=${metrics}`;
  try {
    const r = await fetch(itemsUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, "Api-Version": "2" },
    });
    result.itemsUrl = itemsUrl;
    result.itemsStatus = r.status;
    result.itemsData = await r.json().catch(() => null);
  } catch (e) {
    result.itemsError = String(e);
  }

  return NextResponse.json(result);
}
