import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  tenants,
  adsCampaigns,
  adsItemsSnapshot,
  adsRecomendaciones,
  publicaciones,
  costos,
} from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { construirCandidatos, type ItemSnapshot, type CampaignInfo, type PublicacionMin } from "@/lib/adsAnalysis";
import { generarRecomendaciones } from "@/lib/geminiAds";

function inicioSemana(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0 domingo .. 6 sábado
  const diff = (day === 0 ? -6 : 1) - day; // lunes como inicio de semana
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

async function procesarTenant(
  tenant: typeof tenants.$inferSelect,
  weekStart: string
): Promise<{ tenantId: string; candidatos: number; recomendaciones: number } | { tenantId: string; skipped: string }> {
  const [camps, items, pubs, costosRows] = await Promise.all([
    db.select().from(adsCampaigns).where(eq(adsCampaigns.tenantId, tenant.id)),
    db.select().from(adsItemsSnapshot).where(eq(adsItemsSnapshot.tenantId, tenant.id)),
    db.select().from(publicaciones).where(eq(publicaciones.tenantId, tenant.id)),
    db.select().from(costos).where(eq(costos.tenantId, tenant.id)),
  ]);

  if (camps.length === 0) {
    return { tenantId: tenant.id, skipped: "sin campañas de Ads sincronizadas todavía" };
  }

  const campaignInfos: CampaignInfo[] = camps.map((c) => ({
    campaignId: c.campaignId,
    name: c.name,
    status: c.status,
    acosTarget: c.acosTarget !== null ? Number(c.acosTarget) : null,
    budget: c.budget !== null ? Number(c.budget) : null,
    cost: Number(c.cost ?? 0),
    unitsQuantity: c.unitsQuantity ?? 0,
    acos: Number(c.acos ?? 0),
  }));

  const itemSnapshots: ItemSnapshot[] = items.map((i) => ({
    itemId: i.itemId,
    campaignId: i.campaignId,
    title: i.title,
    price: i.price !== null ? Number(i.price) : 0,
    status: i.status,
    clicks: i.clicks ?? 0,
    cost: Number(i.cost ?? 0),
    unitsQuantity: i.unitsQuantity ?? 0,
    acos: Number(i.acos ?? 0),
    roas: Number(i.roas ?? 0),
  }));

  const pubsMin: PublicacionMin[] = pubs.map((p) => ({
    itemId: p.itemId,
    sku: p.sku ?? null,
    price: p.price !== null ? Number(p.price) : null,
  }));

  const costosMap: Record<string, number> = {};
  costosRows.forEach((c) => {
    if (c.sku) costosMap[c.sku] = Number(c.costoSinIva);
  });

  const candidatos = construirCandidatos(itemSnapshots, campaignInfos, pubsMin, costosMap);

  const recomendaciones = await generarRecomendaciones(candidatos, tenant.nombre || tenant.email || "tu tienda");

  if (recomendaciones.length > 0) {
    await db.insert(adsRecomendaciones).values(
      recomendaciones.map((r) => ({
        tenantId: tenant.id,
        weekStart,
        tipo: r.tipo,
        prioridad: r.prioridad,
        itemId: r.itemId ?? null,
        campaignId: r.campaignId ?? null,
        titulo: r.titulo,
        descripcion: r.descripcion,
        accionSugerida: r.accionSugerida,
      }))
    );
  }

  return { tenantId: tenant.id, candidatos: candidatos.length, recomendaciones: recomendaciones.length };
}

// Procesa TODOS los tenants elegibles en cada corrida — con pocos tenants,
// rotar 1 por hora significaba tardar semanas en cubrirlos a todos una vez
// (esto corre 1 vez por semana). El costo por tenant es 1 solo llamado a
// Gemini, así que hacerlos todos seguidos en la misma invocación es liviano.
// Si en el futuro hay muchísimos tenants, esto se puede volver a convertir
// en rotación o batching — por ahora no hace falta.
// Corre 1 vez por semana vía cron-job.org (ej. lunes a la madrugada).
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

  const weekStart = inicioSemana();
  const resultados = [];

  for (const tenant of eligible) {
    try {
      const r = await procesarTenant(tenant, weekStart);
      resultados.push(r);
    } catch (e) {
      resultados.push({ tenantId: tenant.id, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, tenantsProcesados: resultados.length, resultados });
}
