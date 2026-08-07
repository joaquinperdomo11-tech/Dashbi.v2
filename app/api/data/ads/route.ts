import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, adsCampaigns, adsRecomendaciones, adsAdvertisers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

async function getTenant(userId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  return tenant;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [advertiser] = await db.select().from(adsAdvertisers).where(eq(adsAdvertisers.tenantId, tenant.id));

  if (!advertiser || !advertiser.productAdsEnabled) {
    return NextResponse.json({
      productAdsEnabled: false,
      campañas: [],
      recomendaciones: [],
    });
  }

  const [campañas, todasRecomendaciones] = await Promise.all([
    db.select().from(adsCampaigns).where(eq(adsCampaigns.tenantId, tenant.id)),
    db
      .select()
      .from(adsRecomendaciones)
      .where(eq(adsRecomendaciones.tenantId, tenant.id))
      .orderBy(desc(adsRecomendaciones.weekStart), desc(adsRecomendaciones.createdAt)),
  ]);

  // Solo la semana más reciente que tenga recomendaciones guardadas
  const ultimaSemana = todasRecomendaciones[0]?.weekStart;
  const recomendaciones = ultimaSemana
    ? todasRecomendaciones.filter((r) => r.weekStart === ultimaSemana)
    : [];

  return NextResponse.json({
    productAdsEnabled: true,
    campañas: campañas.map((c) => ({
      campaignId: c.campaignId,
      name: c.name,
      status: c.status,
      acosTarget: c.acosTarget !== null ? Number(c.acosTarget) : null,
      budget: c.budget !== null ? Number(c.budget) : null,
      cost: Number(c.cost ?? 0),
      unitsQuantity: c.unitsQuantity ?? 0,
      acos: Number(c.acos ?? 0),
      roas: Number(c.roas ?? 0),
    })),
    semana: ultimaSemana ?? null,
    recomendaciones: recomendaciones.map((r) => ({
      tipo: r.tipo,
      prioridad: r.prioridad,
      itemId: r.itemId,
      campaignId: r.campaignId,
      titulo: r.titulo,
      descripcion: r.descripcion,
      accionSugerida: r.accionSugerida,
    })),
  });
}
