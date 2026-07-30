import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, publicaciones, ordenes, costos, combos, comboComponentes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [rawPubs, rawOrders, rawCostos, rawCombos, rawComboComponentes] = await Promise.all([
    db.select().from(publicaciones).where(eq(publicaciones.tenantId, tenant.id)),
    db.select().from(ordenes).where(eq(ordenes.tenantId, tenant.id)),
    db.select().from(costos).where(eq(costos.tenantId, tenant.id)),
    db.select().from(combos).where(eq(combos.tenantId, tenant.id)),
    db.select({
      id: comboComponentes.id,
      comboId: comboComponentes.comboId,
      componentSku: comboComponentes.componentSku,
      cantidad: comboComponentes.cantidad,
    }).from(comboComponentes)
      .innerJoin(combos, eq(comboComponentes.comboId, combos.id))
      .where(eq(combos.tenantId, tenant.id)),
  ]);

  const ventasPorSku: Record<string, number> = {};
  rawOrders.forEach(o => {
    if (o.estado === "cancelled" || !o.sku) return;
    ventasPorSku[o.sku] = (ventasPorSku[o.sku] || 0) + (o.cantidad || 0);
  });

  const costosMap: Record<string, string> = {};
  rawCostos.forEach(c => { if (c.sku) costosMap[c.sku] = c.costoSinIva; });

  const bySku = new Map<string, typeof rawPubs[number]>();
  rawPubs.forEach(p => {
    const key = p.sku || `__no_sku_${p.itemId}`;
    const existing = bySku.get(key);
    if (!existing || (p.status === "active" && existing.status !== "active")) {
      bySku.set(key, p);
    }
  });

  const comboBySku = new Map<string, typeof rawCombos[number]>();
  rawCombos.forEach(c => comboBySku.set(c.comboSku, c));
  const componentesByComboId = new Map<number, { componentSku: string; cantidad: number }[]>();
  rawComboComponentes.forEach(cc => {
    const list = componentesByComboId.get(cc.comboId) || [];
    list.push({ componentSku: cc.componentSku, cantidad: cc.cantidad || 1 });
    componentesByComboId.set(cc.comboId, list);
  });

  const stockPorSku: Record<string, number> = {};
  bySku.forEach((p, sku) => { stockPorSku[sku] = p.availableQuantity || 0; });

  const productos = Array.from(bySku.entries()).map(([sku, p]) => {
    const combo = comboBySku.get(sku);
    const isCombo = !!combo;
    let stockCombo: number | null = null;
    let componentes: { sku: string; cantidad: number; stockDisponible: number }[] = [];

    if (combo) {
      const receta = componentesByComboId.get(combo.id) || [];
      componentes = receta.map(r => ({
        sku: r.componentSku,
        cantidad: r.cantidad,
        stockDisponible: stockPorSku[r.componentSku] ?? 0,
      }));
      stockCombo = componentes.length > 0
        ? Math.min(...componentes.map(c => Math.floor(c.stockDisponible / (c.cantidad || 1))))
        : 0;
    }

    return {
      itemId: p.itemId,
      sku,
      title: p.title || "",
      thumbnail: p.thumbnail || "",
      price: Number(p.price) || 0,
      availableQuantity: p.availableQuantity || 0,
      status: p.status || "closed",
      categoryId: p.categoryId || "",
      categoryName: p.categoryName || "",
      ventasHistoricas: ventasPorSku[sku] || 0,
      costoSinIva: costosMap[sku] || "",
      isCombo,
      componentes,
      stockCombo,
      // Promoción activa en ML (solo lectura, sync 1x/día)
      promoActiva: !!p.promoActiva,
      promoTipo: p.promoTipo || "",
      promoPrecio: p.promoPrecio ? Number(p.promoPrecio) : null,
      promoHasta: p.promoHasta ? p.promoHasta.toISOString() : null,
    };
  }).sort((a, b) => b.ventasHistoricas - a.ventasHistoricas);

  const activos = productos.filter(p => p.status === "active");
  const cantidadActivos = activos.length;
  const cantidadTotal = productos.length;
  const cantidadCombos = productos.filter(p => p.isCombo).length;
  const cantidadIndividuales = cantidadTotal - cantidadCombos;

  const costoStock = productos.reduce((sum, p) => {
    const costo = parseFloat(p.costoSinIva || "0");
    if (!costo) return sum;
    const stock = p.isCombo ? (p.stockCombo || 0) : p.availableQuantity;
    return sum + costo * stock;
  }, 0);

  const preciosActivos = activos.filter(p => p.price > 0).map(p => p.price);
  const precioPromedio = preciosActivos.length > 0
    ? preciosActivos.reduce((s, p) => s + p, 0) / preciosActivos.length
    : 0;

  return NextResponse.json({
    productos,
    cards: {
      cantidadActivos,
      cantidadTotal,
      cantidadCombos,
      cantidadIndividuales,
      costoStock,
      precioPromedio,
    },
  });
}
