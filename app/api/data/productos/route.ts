import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, publicaciones, ordenes, costos } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [rawPubs, rawOrders, rawCostos] = await Promise.all([
    db.select().from(publicaciones).where(eq(publicaciones.tenantId, tenant.id)),
    db.select().from(ordenes).where(eq(ordenes.tenantId, tenant.id)),
    db.select().from(costos).where(eq(costos.tenantId, tenant.id)),
  ]);

  // Aggregate historical units sold by SKU
  const ventasPorSku: Record<string, number> = {};
  rawOrders.forEach(o => {
    if (o.estado === "cancelled" || !o.sku) return;
    ventasPorSku[o.sku] = (ventasPorSku[o.sku] || 0) + (o.cantidad || 0);
  });

  const costosMap: Record<string, string> = {};
  rawCostos.forEach(c => { if (c.sku) costosMap[c.sku] = c.costoSinIva; });

  const productos = rawPubs.map(p => ({
    itemId: p.itemId,
    sku: p.sku || "",
    title: p.title || "",
    thumbnail: p.thumbnail || "",
    price: Number(p.price) || 0,
    availableQuantity: p.availableQuantity || 0,
    status: p.status || "closed",
    ventasHistoricas: ventasPorSku[p.sku || ""] || 0,
    costoSinIva: costosMap[p.sku || ""] || "",
  })).sort((a, b) => b.ventasHistoricas - a.ventasHistoricas);

  return NextResponse.json({ productos });
}
