import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, reputacion, visitasMensuales, ordenes } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [rep] = await db.select().from(reputacion).where(eq(reputacion.tenantId, tenant.id));

  const now = new Date();
  const curKey = monthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prevDate);

  const visitasRows = await db.select().from(visitasMensuales).where(eq(visitasMensuales.tenantId, tenant.id));
  const visitasByMonth: Record<string, number> = {};
  visitasRows.forEach(v => { visitasByMonth[v.monthKey] = v.totalVisitas || 0; });

  // Orders count per month for conversion calc
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(prevDate.getFullYear(), prevDate.getMonth(), 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const curOrders = await db.select().from(ordenes)
    .where(and(eq(ordenes.tenantId, tenant.id), gte(ordenes.fecha, curStart)));
  const prevOrders = await db.select().from(ordenes)
    .where(and(eq(ordenes.tenantId, tenant.id), gte(ordenes.fecha, prevStart), lte(ordenes.fecha, prevEnd)));

  const curOrdersCount = curOrders.filter(o => o.estado !== "cancelled").length;
  const prevOrdersCount = prevOrders.filter(o => o.estado !== "cancelled").length;

  const visitasCur = visitasByMonth[curKey] || 0;
  const visitasPrev = visitasByMonth[prevKey] || 0;

  return NextResponse.json({
    storeName: rep?.storeName || tenant.nombre || "",
    levelId: rep?.levelId || "",
    // claimsRate/cancellationsRate/delayedRate se guardan como decimal (ML: 0.0028 = 0.28%),
    // acá se convierten a escala de porcentaje para el frontend.
    claims: { rate: Number(rep?.claimsRate || 0) * 100, limit: Number(rep?.claimsLimit) || 2.5 },
    cancellations: { rate: Number(rep?.cancellationsRate || 0) * 100, limit: Number(rep?.cancellationsLimit) || 1.5 },
    delayed: { rate: Number(rep?.delayedRate || 0) * 100, limit: Number(rep?.delayedLimit) || 10.0 },
    visitas: {
      current: visitasCur,
      previous: visitasPrev,
      conversionCurrent: visitasCur > 0 ? (curOrdersCount / visitasCur) * 100 : 0,
      conversionPrevious: visitasPrev > 0 ? (prevOrdersCount / visitasPrev) * 100 : 0,
      ordersCurrent: curOrdersCount,
      ordersPrevious: prevOrdersCount,
    },
  });
}
