"use client";
import { useMemo, useEffect, useRef, useState } from "react";
import type { Order } from "@/lib/sheets";

interface Props {
  orders: Order[];
  costos: Record<string, number>;
}

const IVA = 1.22;


function useCountUp(target: number, duration = 900, delay = 0) {
  const [current, setCurrent] = useState(0);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    setCurrent(0);
    const t = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - start) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3);
        setCurrent(target * e);
        if (p < 1) raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(t); if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration, delay]);
  return current;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function fmtFull(n: number) {
  return `$${Math.round(n).toLocaleString("es-UY")}`;
}

function toYMD(dateStr: string): string {
  // dateStr is "DD/MM/YYYY" from es-UY locale
  const parts = dateStr.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function getTodayUY(): string {
  return toYMD(new Date().toLocaleDateString("es-UY", {
    timeZone: "America/Montevideo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }));
}

function getYesterdayUY(): string {
  // Get today in UY, then subtract 1 day correctly
  const todayUY = getTodayUY(); // YYYY-MM-DD
  const d = new Date(todayUY + "T12:00:00"); // noon to avoid DST issues
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function getDateUY(fecha: string): string {
  // Parse fecha string and convert to UY date
  // fecha can be ISO "2026-03-13T21:00:00.000Z" or "2026-03-13"
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  return toYMD(d.toLocaleDateString("es-UY", {
    timeZone: "America/Montevideo",
    year: "numeric", month: "2-digit", day: "2-digit",
  }));
}

function calcSummary(ords: Order[], costos: Record<string, number>) {
  const revenue  = ords.reduce((s, o) => s + o.totalItem, 0);
  const comis    = ords.reduce((s, o) => s + o.comisionML, 0);
  const envios   = ords.reduce((s, o) => s + o.shippingCostSeller - o.bonificacionEnvio, 0);
  const costoMerc = ords.reduce((s, o) => s + (costos[o.sku] || 0) * IVA * o.cantidad, 0);
  const rent     = revenue - comis - envios - costoMerc;
  const units    = ords.reduce((s, o) => s + o.cantidad, 0);
  const ticket   = ords.length > 0 ? revenue / ords.length : 0;
  const rentPct  = revenue > 0 ? (rent / revenue) * 100 : 0;
  return { revenue, rent, rentPct, units, orders: ords.length, ticket };
}

function MiniCard({
  label, value, rawValue, sub, trend, trendPp, icon, accent = false,
}: {
  label: string; value: string; rawValue?: number; sub?: string; trend?: number; trendPp?: number; icon: string; accent?: boolean;
}) {
  const trendUp = trend !== undefined && trend >= 0;
  const trendColor = trend === undefined ? "" : trendUp ? "text-green-400" : "text-red-400";
  const trendBg    = trend === undefined ? "" : trendUp ? "bg-green-500/10" : "bg-red-500/10";
  const animated   = useCountUp(rawValue ?? 0, 900);
  const displayVal = rawValue !== undefined
    ? "$" + Math.round(animated).toLocaleString("es-UY")
    : value;

  return (
    <div className={`relative overflow-hidden rounded-2xl border p-4 transition-all hover:translate-y-[-2px] ${
      accent ? "border-green-500/20" : "border-brand-border bg-brand-card"
    }`}>
      {accent && <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full blur-2xl" style={{background:"var(--green-bg)"}} />}
      <div className="relative">
        <div className="flex items-start justify-between mb-2">
          <p className="text-brand-sub text-xs uppercase tracking-wider font-body">{label}</p>
          <span className="text-lg">{icon}</span>
        </div>
        <p className="font-bold text-2xl leading-none" style={{color: accent ? "var(--green)" : "var(--text)"}}>
          {displayVal}
        </p>
        {sub && <p className="text-brand-sub text-xs mt-1.5 font-mono">{sub}</p>}
        {trend !== undefined && (
          <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-mono ${trendBg} ${trendColor}`}>
            <span>{trendUp ? "▲" : "▼"}</span>
            <span>{Math.abs(trend).toFixed(1)}% vs ayer</span>
          </div>
        )}
        {trendPp !== undefined && (
          <div className={`inline-flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full text-xs font-mono ${trendPp >= 0 ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            <span>{trendPp >= 0 ? "▲" : "▼"}</span>
            <span>{Math.abs(trendPp).toFixed(1)}pp vs ayer</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodaySnapshot({ orders, costos }: Props) {
  const today     = getTodayUY();
  const yesterday = getYesterdayUY();

  const todayOrders     = useMemo(() => orders.filter(o => getDateUY(o.fecha) === today),     [orders, today]);
  const yesterdayOrders = useMemo(() => orders.filter(o => getDateUY(o.fecha) === yesterday), [orders, yesterday]);

  const t = useMemo(() => calcSummary(todayOrders,     costos), [todayOrders,     costos]);
  const y = useMemo(() => calcSummary(yesterdayOrders, costos), [yesterdayOrders, costos]);

  function pct(cur: number, prev: number) {
    if (!prev) return undefined;
    return ((cur - prev) / prev) * 100;
  }

  // Products sold today grouped by SKU
  const productosHoy = useMemo(() => {
    const map: Record<string, { producto: string; sku: string; units: number; revenue: number; rent: number }> = {};
    todayOrders.forEach(o => {
      if (!map[o.sku]) map[o.sku] = { producto: o.producto, sku: o.sku, units: 0, revenue: 0, rent: 0 };
      const costo = (costos[o.sku] || 0) * IVA * o.cantidad;
      const rentOrden = o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - costo;
      map[o.sku].units   += o.cantidad;
      map[o.sku].revenue += o.totalItem;
      map[o.sku].rent    += rentOrden;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [todayOrders, costos]);

  const todayLabel = new Date().toLocaleDateString("es-UY", {
    timeZone: "America/Montevideo",
    weekday: "long", day: "numeric", month: "long",
  });

  if (todayOrders.length === 0 && yesterdayOrders.length === 0) return null;

  return (
    <section className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <p className="text-brand-sub text-xs font-mono uppercase tracking-widest">Hoy</p>
          <p className="text-brand-muted text-xs font-mono capitalize">{todayLabel}</p>
        </div>
        <p className="text-brand-muted text-xs font-mono">vs ayer</p>
      </div>

      {/* 5 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <MiniCard
          label="Ingresos"
          value={fmtFull(t.revenue)}
          rawValue={t.revenue}
          icon="💰"
          accent
          trend={pct(t.revenue, y.revenue)}
        />
        <MiniCard
          label="Ticket promedio"
          value={fmtFull(t.ticket)}
          rawValue={t.ticket}
          icon="🎯"
          trend={pct(t.ticket, y.ticket)}
        />
        <MiniCard
          label="Órdenes"
          value={t.orders.toString()}
          icon="🛒"
          trend={pct(t.orders, y.orders)}
        />
        <MiniCard
          label="Unidades"
          value={t.units.toString()}
          icon="📦"
          trend={pct(t.units, y.units)}
        />
        <div className="col-span-2 sm:col-span-1">
          <MiniCard
            label="Rentabilidad"
            value={`${t.rentPct.toFixed(1)}%`}
            sub={`${fmt(t.rent)} · antes de imp.`}
            icon="📈"
            accent
            trendPp={y.rentPct !== 0 ? t.rentPct - y.rentPct : undefined}
          />
        </div>
      </div>

      {/* Products — no scroll, card list */}
      {productosHoy.length > 0 && (
        <div className="bg-brand-card border border-brand-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-brand-border">
            <p className="text-brand-sub text-xs font-mono uppercase tracking-widest">
              Productos vendidos hoy · {productosHoy.length} SKU{productosHoy.length !== 1 ? "s" : ""}
            </p>
          </div>
          {/* Header row */}
          <div className="px-4 py-2 flex items-center gap-3 border-b border-brand-border/50">
            <div className="flex-1 min-w-0" />
            <div className="flex items-center gap-4 flex-shrink-0">
              <p className="text-brand-muted text-[9px] uppercase font-mono w-6 text-center">Uds</p>
              <p className="text-brand-muted text-[9px] uppercase font-mono w-20 text-center">Ingresos</p>
              <p className="text-brand-muted text-[9px] uppercase font-mono w-20 text-center hidden sm:block">Rent. $</p>
              <p className="text-brand-muted text-[9px] uppercase font-mono w-10 text-center">Rent. %</p>
            </div>
          </div>
          <div className="divide-y divide-brand-border/20">
            {productosHoy.map((p) => {
              const hasCosto = costos[p.sku] !== undefined;
              const rentPct  = p.revenue > 0 ? (p.rent / p.revenue) * 100 : 0;
              return (
                <div key={p.sku} className="px-4 py-2 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-brand-text text-xs font-body leading-snug truncate">{p.producto}</p>
                    <p className="text-brand-muted text-[10px] font-mono">{p.sku}</p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0 text-xs font-mono">
                    <p className="text-brand-text font-medium w-6 text-center">{p.units}</p>
                    <p className="font-bold w-20 text-right" style={{color:"var(--green)"}}>{fmtFull(p.revenue)}</p>
                    <p className={`font-medium w-20 text-right hidden sm:block ${hasCosto ? (rentPct >= 0 ? "text-green-500" : "text-red-400") : "text-brand-muted"}`}>
                      {hasCosto ? fmtFull(p.rent) : "—"}
                    </p>
                    <p className={`font-medium w-10 text-right ${hasCosto ? (rentPct >= 0 ? "text-green-500" : "text-red-400") : "text-brand-muted"}`}>
                      {hasCosto ? `${rentPct.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
