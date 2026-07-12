export interface Publicacion {
  id: string;
  title: string;
  sku: string;
  price: number;
  available_quantity: number;
  status: "active" | "paused" | "closed" | "under_review";
  category_id: string;
  category_name: string;
  sold_quantity: number;
  health: number | null;
  health_detail: { photos: number; description: number; attributes: number; title: number } | null;
  unanswered_questions: number;
  thumbnail: string;
  permalink: string;
}

export interface Order {
  orderId: string;
  fecha: string;
  hora: string;
  producto: string;
  sku: string;
  cantidad: number;
  precioUnitario: number;
  totalItem: number;
  comisionML: number;
  netoSinEnvio: number;
  itemIdML: string;
  logisticMode: string;
  logisticType: string;
  tipoEnvio: string;
  shipmentId: string;
  shippingCostSeller: number;
  bonificacionEnvio: number;
  margenReal: number;
  medioPago: string;
  cuotas: number;
  estado: string;
  buyer: string;
  estadoEnvio: string;
  ciudadEntrega: string;
  departamentoEntrega: string;
}

export interface LogisticaRow {
  numProveedor: string;
  shipmentId: string;
  fechaEntrega: string;
  zona: string;
  precioProveedor: number;
  estadoProveedor: string;
  repartidor: string;
  direccion: string;
  tipo: string;
}

export interface LogisticaMonth {
  monthKey: string;
  rows: LogisticaRow[];
}

export interface StockItem {
  "Item ID ML": string;
  "SKU": string;
  "Título": string;
  "Stock Disponible": number;
  "Precio": number;
  "Estado": string;
}

export interface VisitaDay {
  fecha: string;
  visitas: number;
  ventas: number;
  conversion: number;
}

export interface DashboardData {
  orders: Order[];
  summary: {
    totalRevenue: number;
    totalMargen: number;
    totalComisiones: number;
    totalEnvios: number;
    totalCostoMercaderia: number;
    rentabilidadReal: number;
    rentabilidadPct: number;
    totalOrders: number;
    totalUnits: number;
    avgOrderValue: number;
    avgMargen: number;
    margenPct: number;
  };
  revenueByDay: { date: string; revenue: number; margen: number; orders: number }[];
  revenueByMonth: { month: string; revenue: number; margen: number; orders: number }[];
  topProducts: { name: string; sku: string; units: number; revenue: number; margen: number }[];
  tipoEnvioBreakdown: { tipo: string; count: number; color: string }[];
  medioPagoBreakdown: { medio: string; count: number; revenue: number }[];
  cuotasBreakdown: { cuotas: string; count: number }[];
  waterfallData: { name: string; value: number; total: number; color: string; isTotal: boolean }[];
  heatmap: { day: number; hour: number; count: number; revenue: number }[];
  skuPerformance: {
    sku: string;
    name: string;
    itemIdML: string;
    units: number;
    revenue: number;
    margen: number;
    comision: number;
    envio: number;
    margenPct: number;
  }[];
  currentMonth: {
    revenue: number;
    margen: number;
    comisiones: number;
    envios: number;
    orders: number;
    units: number;
    margenPct: number;
    avgMargen: number;
    avgOrderValue: number;
    costoMercaderia: number;
    rentabilidadReal: number;
    rentabilidadPct: number;
  };
  prevMonth: {
    revenue: number;
    margen: number;
    comisiones: number;
    envios: number;
    orders: number;
    units: number;
    margenPct: number;
    avgMargen: number;
    avgOrderValue: number;
    costoMercaderia: number;
    rentabilidadReal: number;
    rentabilidadPct: number;
  };
  revenueCurrentMonth: { day: number; revenue: number; margen: number; orders: number }[];
  revenuePrevMonth: { day: number; revenue: number; margen: number; orders: number }[];
  stock: StockItem[];
  logistica: LogisticaMonth[];
  visitas: VisitaDay[];
  costos: Record<string, number>;
  kits?: Record<string, {sku_componente: string; cantidad: number}[]>;
  publicaciones: Publicacion[];
  adsData: any[];
  lastUpdated: string;
}

const ENVIO_COLORS: Record<string, string> = {
  "FULL": "#EA580C",
  "FLEX": "#F97316",
  "MERCADO ENVIOS": "#88AAFF",
  "ENVIO POR FUERA": "#AA88FF",
  "RETIRO": "#44DDAA",
  "SIN ENVÍO": "#555577",
  "OTRO TIPO": "#888899",
  "PENDIENTE": "#C8C8D0",
};

const PAGO_LABELS: Record<string, string> = {
  account_money: "Cuenta ML",
  visa: "Visa",
  master: "Mastercard",
  oca: "OCA",
  debvisa: "Débito Visa",
  debmaster: "Débito Master",
  abitab: "Abitab",
  redpagos: "Redpagos",
  amex: "Amex",
};

// ── Fetch de datos desde Neon (Drizzle) para un tenant específico ──

import { db } from "./db";
import { ordenes as ordenesTable, publicaciones as publicacionesTable } from "./db/schema";
import { eq } from "drizzle-orm";

export async function fetchDashboardData(tenantId: string): Promise<DashboardData> {
  const [rawOrders, rawPublicaciones] = await Promise.all([
    db.select().from(ordenesTable).where(eq(ordenesTable.tenantId, tenantId)),
    db.select().from(publicacionesTable).where(eq(publicacionesTable.tenantId, tenantId)),
  ]);

  // Map orders from Drizzle to our Order interface
  const orders: Order[] = (rawOrders || [])
    .filter((r) => r.estado !== "cancelled")
    .map((r) => {
      const fecha = r.fecha ? new Date(r.fecha) : new Date();
      const hora = fecha.toISOString().split("T")[1]?.slice(0, 8) || "";
      return {
        orderId:             String(r.orderId ?? ""),
        fecha:               fecha.toISOString(),
        hora,
        producto:            String(r.producto ?? ""),
        sku:                 String(r.sku ?? ""),
        cantidad:            Number(r.cantidad) || 1,
        precioUnitario:      Number(r.precioUnitario) || 0,
        totalItem:           Number(r.totalItem) || 0,
        comisionML:          Number(r.comisionMl) || 0,
        netoSinEnvio:        (Number(r.totalItem) || 0) - (Number(r.comisionMl) || 0),
        itemIdML:            String(r.itemIdMl ?? ""),
        logisticMode:        "",
        logisticType:        "",
        tipoEnvio:           String(r.tipoEnvio ?? "SIN ENVÍO"),
        shipmentId:          String(r.shipmentId ?? ""),
        shippingCostSeller:  Number(r.shippingCostSeller) || 0,
        bonificacionEnvio:   Number(r.bonificacionEnvio) || 0,
        margenReal:          (Number(r.totalItem) || 0) - (Number(r.comisionMl) || 0) - (Number(r.shippingCostSeller) || 0) + (Number(r.bonificacionEnvio) || 0),
        medioPago:           "",
        cuotas:              1,
        estado:              String(r.estado ?? ""),
        buyer:               String(r.buyer ?? ""),
        estadoEnvio:         String(r.estadoEnvio ?? ""),
        ciudadEntrega:       "",
        departamentoEntrega: "",
      };
    });

  // Map publicaciones
  const publicaciones: Publicacion[] = (rawPublicaciones || []).map((p) => ({
    id:                   String(p.itemId ?? ""),
    title:                String(p.title ?? ""),
    sku:                  String(p.sku ?? ""),
    price:                Number(p.price) || 0,
    available_quantity:   Number(p.availableQuantity) ?? 0,
    status:               String(p.status ?? "closed") as Publicacion["status"],
    category_id:          "",
    category_name:        "",
    sold_quantity:        Number(p.soldQuantity) || 0,
    health:               null,
    health_detail:        null,
    unanswered_questions: 0,
    thumbnail:            String(p.thumbnail ?? ""),
    permalink:            "",
  }));

  const costos: Record<string, number> = {}; // TODO: costos table not yet implemented in v2

  const processed = processData(orders, [], [], [], costos, {});
  processed.publicaciones = publicaciones;
  processed.adsData = [];
  processed.lastUpdated = new Date().toISOString();
  return processed;
}

function parseHora(horaStr: string): number {
  if (!horaStr) return 0;
  // Formato HH:mm:ss — Apps Script stores Uruguay local time as string
  if (/^\d{1,2}:\d{2}/.test(horaStr)) return parseInt(horaStr.split(":")[0]) || 0;
  // Formato ISO de Sheets: "1899-12-30T21:09:00.000Z" → UTC value IS the local time
  try {
    const d = new Date(horaStr);
    if (!isNaN(d.getTime())) return d.getUTCHours();
  } catch {}
  return 0;
}

function processData(orders: Order[], stock: StockItem[] = [], logistica: LogisticaMonth[] = [], visitas: VisitaDay[] = [], costos: Record<string, number> = {}, kitsMap: Record<string, {sku_componente: string; cantidad: number}[]> = {}): DashboardData {
  const totalRevenue = orders.reduce((s, o) => s + o.totalItem, 0);
  const totalMargen = orders.reduce((s, o) => s + o.margenReal, 0);
  const totalComisiones = orders.reduce((s, o) => s + o.comisionML, 0);
  const totalEnviosBruto = orders.reduce((s, o) => s + o.shippingCostSeller, 0);
  const totalBonif = orders.reduce((s, o) => s + o.bonificacionEnvio, 0);
  const totalEnvios = totalEnviosBruto - totalBonif;
  const IVA = 1.22;
  const totalCostoMercaderia = orders.reduce((s, o) => {
    const costo = costos[o.sku] || 0;
    return s + (costo * IVA * o.cantidad);
  }, 0);
  const hasCostos = totalCostoMercaderia > 0;
  const totalUnits = orders.reduce((s, o) => s + o.cantidad, 0);

  // ── Revenue por día ──────────────────────────────────────────
  const dayMap: Record<string, { revenue: number; margen: number; orders: number }> = {};
  orders.forEach((o) => {
    const d = new Date(o.fecha);
    if (isNaN(d.getTime())) return;
    const key = d.toISOString().split("T")[0];
    if (!dayMap[key]) dayMap[key] = { revenue: 0, margen: 0, orders: 0 };
    dayMap[key].revenue += o.totalItem;
    dayMap[key].margen += o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - (costos[o.sku] || 0) * IVA * o.cantidad;
    dayMap[key].orders += 1;
  });

  const revenueByDay = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }));

  // ── Revenue por mes ──────────────────────────────────────────
  const monthMap: Record<string, { revenue: number; margen: number; orders: number }> = {};
  orders.forEach((o) => {
    const d = new Date(o.fecha);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { revenue: 0, margen: 0, orders: 0 };
    monthMap[key].revenue += o.totalItem;
    monthMap[key].margen += o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - (costos[o.sku] || 0) * IVA * o.cantidad;
    monthMap[key].orders += 1;
  });

  const revenueByMonth = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  // ── Top productos ────────────────────────────────────────────
  const productMap: Record<string, { sku: string; units: number; revenue: number; margen: number }> = {};
  orders.forEach((o) => {
    const key = o.producto || "Sin título";
    if (!productMap[key]) productMap[key] = { sku: o.sku, units: 0, revenue: 0, margen: 0 };
    const costo = (costos[o.sku] || 0) * IVA * o.cantidad;
    productMap[key].units += o.cantidad;
    productMap[key].revenue += o.totalItem;
    productMap[key].margen += o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - costo;
  });

  const topProducts = Object.entries(productMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // ── Tipo de envío ────────────────────────────────────────────
  const envioMap: Record<string, number> = {};
  orders.forEach((o) => {
    envioMap[o.tipoEnvio] = (envioMap[o.tipoEnvio] || 0) + 1;
  });

  const tipoEnvioBreakdown = Object.entries(envioMap)
    .map(([tipo, count]) => ({ tipo, count, color: ENVIO_COLORS[tipo] || "#555577" }))
    .sort((a, b) => b.count - a.count);

  // ── Medio de pago ────────────────────────────────────────────
  const pagoMap: Record<string, { count: number; revenue: number }> = {};
  orders.forEach((o) => {
    const key = o.medioPago;
    if (!pagoMap[key]) pagoMap[key] = { count: 0, revenue: 0 };
    pagoMap[key].count += 1;
    pagoMap[key].revenue += o.totalItem;
  });

  const medioPagoBreakdown = Object.entries(pagoMap)
    .map(([medio, v]) => ({ medio: PAGO_LABELS[medio] || medio, ...v }))
    .sort((a, b) => b.count - a.count);

  // ── Cuotas ───────────────────────────────────────────────────
  const cuotasMap: Record<string, number> = {};
  orders.forEach((o) => {
    const key = o.cuotas === 1 ? "Contado" : `${o.cuotas} cuotas`;
    cuotasMap[key] = (cuotasMap[key] || 0) + 1;
  });

  const cuotasBreakdown = Object.entries(cuotasMap)
    .map(([cuotas, count]) => ({ cuotas, count }))
    .sort((a, b) => {
      if (a.cuotas === "Contado") return -1;
      if (b.cuotas === "Contado") return 1;
      return parseInt(a.cuotas) - parseInt(b.cuotas);
    });

  // ── Waterfall: Ingreso → Margen ──────────────────────────────
  // Recharts waterfall trick: each bar = [start, end]
  // We use a composed bar with invisible base + colored bar
  const waterfallData = [
    {
      name: "Ingreso bruto",
      value: totalRevenue,
      total: totalRevenue,
      color: "#FFE500",
      isTotal: false,
    },
    {
      name: "Comisiones ML",
      value: -totalComisiones,
      total: totalRevenue - totalComisiones,
      color: "#FF4466",
      isTotal: false,
    },
    {
      name: "Costo envíos",
      value: -totalEnviosBruto,
      total: totalRevenue - totalComisiones - totalEnviosBruto,
      color: "#FF6B35",
      isTotal: false,
    },
    {
      name: "Bonif. envíos",
      value: totalBonif,
      total: totalRevenue - totalComisiones - totalEnviosBruto + totalBonif,
      color: "#44DDAA",
      isTotal: false,
    },
    ...(hasCostos ? [{
      name: "Costo mercadería",
      value: -totalCostoMercaderia,
      total: totalRevenue - totalComisiones - totalEnviosBruto + totalBonif - totalCostoMercaderia,
      color: "#a855f7",
      isTotal: false,
    }] : []),
    {
      name: hasCostos ? "Rentabilidad" : "Margen real",
      value: hasCostos ? totalRevenue - totalComisiones - totalEnviosBruto + totalBonif - totalCostoMercaderia : totalMargen,
      total: hasCostos ? totalRevenue - totalComisiones - totalEnviosBruto + totalBonif - totalCostoMercaderia : totalMargen,
      color: "#88AAFF",
      isTotal: true,
    },
  ];

  // ── Heatmap día × hora ───────────────────────────────────────
  // day: 0=Dom, 1=Lun ... 6=Sab | hour: 0-23
  const heatmapMap: Record<string, { count: number; revenue: number }> = {};

  orders.forEach((o) => {
    const d = new Date(o.fecha);
    if (isNaN(d.getTime())) return;
    const day = d.getUTCDay(); // 0-6
    const hour = parseHora(o.hora);
    const key = `${day}-${hour}`;
    if (!heatmapMap[key]) heatmapMap[key] = { count: 0, revenue: 0 };
    heatmapMap[key].count += 1;
    heatmapMap[key].revenue += o.totalItem;
  });

  const heatmap: { day: number; hour: number; count: number; revenue: number }[] = [];
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`;
      heatmap.push({
        day,
        hour,
        count: heatmapMap[key]?.count || 0,
        revenue: heatmapMap[key]?.revenue || 0,
      });
    }
  }

  // ── SKU Performance ──────────────────────────────────────────
  const skuMap: Record<string, {
    name: string; itemIdML: string; units: number; revenue: number;
    margen: number; comision: number; envio: number;
  }> = {};

  orders.forEach((o) => {
    const key = o.sku || o.producto?.slice(0, 20) || "SIN SKU";
    if (!skuMap[key]) {
      skuMap[key] = { name: o.producto, itemIdML: o.itemIdML || '', units: 0, revenue: 0, margen: 0, comision: 0, envio: 0 };
    }
    skuMap[key].units += o.cantidad;
    skuMap[key].revenue += o.totalItem;
    skuMap[key].margen += o.margenReal;
    skuMap[key].comision += o.comisionML;
    skuMap[key].envio += (o.shippingCostSeller - o.bonificacionEnvio);
  });

  const skuPerformance = Object.entries(skuMap)
    .map(([sku, v]) => ({
      sku,
      ...v,
      margenPct: v.revenue > 0 ? (v.margen / v.revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Mes actual vs mes anterior ──────────────────────────────
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0-indexed
  const curDay = now.getDate();

  const prevMonthDate = new Date(curYear, curMonth - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();

  const currentMonthOrders = orders.filter((o) => {
    const d = new Date(o.fecha);
    return d.getFullYear() === curYear && d.getMonth() === curMonth;
  });

  // Same day range in previous month for KPI comparison (e.g. if today is day 10, compare days 1-10)
  const prevMonthOrders = orders.filter((o) => {
    const d = new Date(o.fecha);
    return d.getFullYear() === prevYear && d.getMonth() === prevMonth && d.getDate() <= curDay;
  });

  // Full previous month for the day-by-day chart
  const prevMonthOrdersFull = orders.filter((o) => {
    const d = new Date(o.fecha);
    return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
  });

  function calcPeriodSummary(ords: typeof orders) {
    const rev = ords.reduce((s, o) => s + o.totalItem, 0);
    const mar = ords.reduce((s, o) => s + o.margenReal, 0);
    const com = ords.reduce((s, o) => s + o.comisionML, 0);
    const env = ords.reduce((s, o) => s + o.shippingCostSeller - o.bonificacionEnvio, 0);
    const uni = ords.reduce((s, o) => s + o.cantidad, 0);
    const costoMerc = ords.reduce((s, o) => s + (costos[o.sku] || 0) * IVA * o.cantidad, 0);
    const rentReal = rev - costoMerc - com - env;
    return {
      revenue: rev,
      margen: mar,
      comisiones: com,
      envios: env,
      orders: ords.length,
      units: uni,
      margenPct: rev > 0 ? (mar / rev) * 100 : 0,
      avgMargen: ords.length > 0 ? mar / ords.length : 0,
      avgOrderValue: ords.length > 0 ? rev / ords.length : 0,
      costoMercaderia: costoMerc,
      rentabilidadReal: rentReal,
      rentabilidadPct: rev > 0 ? (rentReal / rev) * 100 : 0,
    };
  }

  const currentMonth = calcPeriodSummary(currentMonthOrders);
  const prevMonthData = calcPeriodSummary(prevMonthOrders);

  // Day-by-day for current month and prev month
  const revenueCurrentMonth: { day: number; revenue: number; margen: number; orders: number }[] = [];
  const revenuePrevMonth: { day: number; revenue: number; margen: number; orders: number }[] = [];

  // Current month: fill all days 1..curDay
  for (let d = 1; d <= curDay; d++) {
    const dayOrders = currentMonthOrders.filter((o) => new Date(o.fecha).getDate() === d);
    revenueCurrentMonth.push({
      day: d,
      revenue: dayOrders.reduce((s, o) => s + o.totalItem, 0),
      margen: dayOrders.reduce((s, o) => s + o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - (costos[o.sku] || 0) * IVA * o.cantidad, 0),
      orders: dayOrders.length,
    });
  }

  // Prev month: all days of the month
  const prevMonthTotalDays = new Date(prevYear, prevMonth + 1, 0).getDate();
  for (let d = 1; d <= prevMonthTotalDays; d++) {
    const dayOrders = prevMonthOrdersFull.filter((o) => new Date(o.fecha).getDate() === d);
    revenuePrevMonth.push({
      day: d,
      revenue: dayOrders.reduce((s, o) => s + o.totalItem, 0),
      margen: dayOrders.reduce((s, o) => s + o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - (costos[o.sku] || 0) * IVA * o.cantidad, 0),
      orders: dayOrders.length,
    });
  }


    return {
    orders,
    stock,
    logistica,
    visitas,
    costos,
    kits: kitsMap,
    publicaciones: [],
    adsData: [],
    lastUpdated: '',
    summary: {
      totalRevenue,
      totalMargen,
      totalComisiones,
      totalEnvios,
      totalCostoMercaderia,
      rentabilidadReal: totalRevenue - totalCostoMercaderia - totalComisiones - totalEnvios,
      rentabilidadPct: totalRevenue > 0 ? ((totalRevenue - totalCostoMercaderia - totalComisiones - totalEnvios) / totalRevenue) * 100 : 0,
      totalOrders: orders.length,
      totalUnits,
      avgOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      avgMargen: orders.length > 0 ? totalMargen / orders.length : 0,
      margenPct: totalRevenue > 0 ? (totalMargen / totalRevenue) * 100 : 0,
    },
    revenueByDay,
    revenueByMonth,
    topProducts,
    tipoEnvioBreakdown,
    medioPagoBreakdown,
    cuotasBreakdown,
    waterfallData,
    heatmap,
    skuPerformance,
    currentMonth,
    prevMonth: prevMonthData,
    revenueCurrentMonth,
    revenuePrevMonth,
  };
}
