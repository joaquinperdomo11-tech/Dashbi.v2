"use client";
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from "recharts";
import { useState, useMemo } from "react";

interface WaterfallProps {
  costos?: Record<string, number>;
  allOrders: {
    fecha: string;
    totalItem: number;
    comisionML: number;
    shippingCostSeller: number;
    bonificacionEnvio: number;
    margenReal: number;
    sku: string;
    cantidad: number;
  }[];
}

function formatCurrency(value: number) {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function getAvailableMonths(orders: WaterfallProps["allOrders"]) {
  const months = new Set<string>();
  orders.forEach((o) => {
    const d = new Date(o.fecha);
    if (!isNaN(d.getTime())) months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  });
  return Array.from(months).sort().reverse();
}

function formatMonthLabel(m: string) {
  const [year, month] = m.split("-");
  const names = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${names[parseInt(month) - 1]} ${year.slice(2)}`;
}

function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildWaterfall(
  orders: WaterfallProps["allOrders"],
  adsInversion: number,
  _showAds: boolean,
  costos: Record<string, number> = {}
) {
  const totalRevenue    = orders.reduce((s, o) => s + o.totalItem, 0);
  const totalComisiones = orders.reduce((s, o) => s + o.comisionML, 0);
  const totalEnviosNeto = orders.reduce((s, o) => s + o.shippingCostSeller - o.bonificacionEnvio, 0);
  const totalMargen     = orders.reduce((s, o) => s + o.margenReal, 0);
  const totalCostoMerc  = orders.reduce((s, o) => s + (costos[o.sku] || 0) * 1.22 * o.cantidad, 0);
  const rentabilidad    = totalRevenue - totalComisiones - totalEnviosNeto - totalCostoMerc;
  const rentabilidadConAds = rentabilidad - adsInversion;
  const margenConAds    = rentabilidadConAds;

  // Middle items sorted by absolute impact (descending)
  interface WStep { name: string; value: number; color: string; amount: number; }
  const middleItems: WStep[] = [
    { name: "Costo mercadería", value: -totalCostoMerc, color: "#6366f1", amount: totalCostoMerc },
    { name: "Comisiones ML",    value: -totalComisiones, color: "#f43f5e", amount: totalComisiones },
    { name: "Envíos",           value: -totalEnviosNeto, color: "#f97316", amount: Math.abs(totalEnviosNeto) },
  ];
  if (adsInversion > 0) {
    middleItems.push({ name: "Publicidad (IVA incl.)", value: -adsInversion, color: "#f59e0b", amount: adsInversion });
  }
  // Sort by impact descending, but skip items with 0
  middleItems.sort((a, b) => b.amount - a.amount);

  let running = totalRevenue;
  const steps: any[] = [
    { name: "Ingresos", value: totalRevenue, color: "var(--accent)", isTotal: false, base: 0, bar: totalRevenue },
  ];

  middleItems.forEach(item => {
    if (item.amount === 0 && item.name !== "Envíos") return;
    const isPositive = item.value >= 0;
    const barSize = Math.abs(item.value);
    const base = isPositive ? running : running - barSize;
    steps.push({
      name: item.name,
      value: item.value,
      color: isPositive ? "#10b981" : item.color,
      isTotal: false,
      base,
      bar: barSize,
    });
    running += item.value;
  });

  const rentFinal = adsInversion > 0 ? rentabilidadConAds : rentabilidad;
  steps.push({
    name: "Rentabilidad",
    value: rentFinal,
    color: "var(--accent)",
    isTotal: true,
    base: 0,
    bar: rentFinal,
  });

  // Inject totalRevenue into each step for % calculation in tooltip
  steps.forEach(s => { (s as any).totalRevenue = totalRevenue; });
  return { steps, totalRevenue, totalMargen, totalCostoMerc, margenConAds, adsInversion };
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const pct = d?.totalRevenue > 0 && d?.name !== "Ingreso bruto"
    ? Math.abs(d.value / d.totalRevenue * 100).toFixed(1)
    : null;
  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-3 shadow-xl">
      <p className="text-brand-sub text-xs mb-1 font-mono">{label}</p>
      <p className="font-display font-bold text-lg" style={{ color: d?.color }}>
        {d?.value >= 0 ? "+" : ""}{formatCurrency(d?.value || 0)}
      </p>
      {pct && (
        <p className="text-brand-sub text-xs font-mono mt-0.5">
          {d.value < 0 ? "-" : "+"}{pct}% sobre ingresos
        </p>
      )}
    </div>
  );
};

export default function WaterfallChart({ allOrders, costos = {} }: WaterfallProps) {
  const availableMonths = useMemo(() => getAvailableMonths(allOrders), [allOrders]);
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());
  const [showPicker, setShowPicker] = useState(false);
  const getTotalInversionForMonth = (_key: string) => 0;
  const months: { monthKey: string; totalInversion: number; desde: string; hasta: string }[] = [];

  const filteredOrders = useMemo(() => {
    if (selectedMonth === "year") {
      const year = new Date().getFullYear();
      return allOrders.filter((o) => new Date(o.fecha).getFullYear() === year);
    }
    return allOrders.filter((o) => {
      const d = new Date(o.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    });
  }, [allOrders, selectedMonth]);

  // Get ads inversion for exactly the selected month
  const adsInversion = useMemo(() => {
    if (selectedMonth === "year") {
      // Sum all loaded months for the current year
      const curYear = new Date().getFullYear().toString();
      return months
        .filter(m => m.monthKey.startsWith(curYear))
        .reduce((s, m) => s + m.totalInversion, 0) * 1.22;
    }
    return getTotalInversionForMonth(selectedMonth) * 1.22;
  }, [selectedMonth, getTotalInversionForMonth, months]);

  // Period label for the ads
  const adsPeriodo = useMemo(() => {
    if (selectedMonth === "year") return `Año ${new Date().getFullYear()}`;
    const m = months.find(mo => mo.monthKey === selectedMonth);
    return m ? `${m.desde} — ${m.hasta}` : "";
  }, [selectedMonth, months]);

  const hasAds = adsInversion > 0;

  const { steps, totalRevenue, totalMargen, margenConAds } = useMemo(
    () => buildWaterfall(filteredOrders, adsInversion, true, costos),
    [filteredOrders, adsInversion, costos]
  );

  const margenPct         = totalRevenue > 0 ? (totalMargen / totalRevenue) * 100 : 0;
  const margenConAdsPct   = totalRevenue > 0 ? (margenConAds / totalRevenue) * 100 : 0;
  const maxVal            = Math.max(...steps.map((s) => s.base + s.bar));

  const filterLabel = selectedMonth === "year"
    ? `Año ${new Date().getFullYear()}`
    : availableMonths.includes(selectedMonth) ? formatMonthLabel(selectedMonth) : "Mes actual";

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-6">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-brand-text text-lg mb-0.5">Desglose Financiero</h3>
          <p className="text-brand-sub text-sm">De ingresos brutos al rentabilidad</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Ads toggle — only show if ads loaded */}
          {/* Period picker */}
          <div className="relative">
            <button
              onClick={() => setShowPicker(!showPicker)}
              className="px-3 py-1.5 text-xs font-mono border border-brand-border rounded-lg text-brand-sub hover:text-brand-text transition-all"
            >
              📅 {filterLabel}
            </button>
            {showPicker && (
              <div className="absolute right-0 top-9 z-20 bg-brand-card border border-brand-border rounded-xl shadow-xl p-3 min-w-[160px]">
                <button onClick={() => { setSelectedMonth(getCurrentMonthKey()); setShowPicker(false); }}
                  className={`w-full text-left px-2 py-1.5 text-xs font-mono rounded-lg mb-1 ${selectedMonth === getCurrentMonthKey() ? "bg-brand-yellow/10 text-brand-yellow" : "text-brand-sub hover:text-brand-text"}`}>
                  Mes actual
                </button>
                <button onClick={() => { setSelectedMonth("year"); setShowPicker(false); }}
                  className={`w-full text-left px-2 py-1.5 text-xs font-mono rounded-lg mb-1 ${selectedMonth === "year" ? "bg-brand-yellow/10 text-brand-yellow" : "text-brand-sub hover:text-brand-text"}`}>
                  Año {new Date().getFullYear()}
                </button>
                <div className="border-t border-brand-border my-1" />
                <div className="max-h-48 overflow-y-auto space-y-0.5">
                  {availableMonths.map((m) => (
                    <button key={m} onClick={() => { setSelectedMonth(m); setShowPicker(false); }}
                      className={`w-full text-left px-2 py-1.5 text-xs font-mono rounded-lg ${selectedMonth === m ? "bg-brand-yellow/10 text-brand-yellow" : "text-brand-sub hover:text-brand-text"}`}>
                      {formatMonthLabel(m)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ads notice — only show when no ads loaded */}
      {!hasAds && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-brand-dark border border-brand-border rounded-xl">
          <p className="text-brand-muted text-xs font-mono">
            💡 Cargá el reporte de publicidad en la pestaña Publicidad para ver el impacto en el margen
          </p>
        </div>
      )}

      {/* Mobile list view */}
      <div className="sm:hidden space-y-2 mb-2">
        {steps.map((step, i) => {
          const pct = step.totalRevenue > 0 && step.name !== "Ingresos"
            ? Math.abs(step.value / step.totalRevenue * 100).toFixed(1) + "%"
            : null;
          return (
            <div key={i} className="flex items-center justify-between py-2 border-b border-brand-border/30 last:border-0">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background: step.color}} />
                <span className="text-xs font-medium" style={{color:"var(--text)"}}>{step.name}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold font-mono" style={{color: step.isTotal ? "var(--green)" : step.value >= 0 ? "var(--green)" : "var(--text)"}}>
                  {step.value >= 0 ? "+" : ""}{formatCurrency(step.value)}
                </span>
                {pct && <span className="text-[10px] font-mono ml-1.5" style={{color:"var(--sub)"}}>{pct}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop chart */}
      <div className="hidden sm:block">
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={steps} margin={{ top: 20, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: "var(--sub)", fontSize: 10, fontFamily: "DM Sans" }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={formatCurrency} tick={{ fill: "var(--sub)", fontSize: 10, fontFamily: "DM Mono" }} axisLine={false} tickLine={false} width={60} domain={[0, maxVal * 1.2]} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(234,88,12,0.04)" }} />
          <Bar dataKey="base" stackId="a" fill="transparent" />
          <Bar dataKey="bar" stackId="a" radius={[4, 4, 0, 0]}>
            {steps.map((entry, i) => <Cell key={i} fill={entry.color} opacity={entry.isTotal ? 1 : 0.85} />)}
            <LabelList
              dataKey="name"
              position="top"
              content={(props: any) => {
                const { x, y, width, value } = props;
                const step = steps.find(s => s.name === value);
                if (!step) return null;
                const pct = (step as any).totalRevenue > 0 && step.name !== "Ingreso bruto"
                  ? ` (${Math.abs(step.value / (step as any).totalRevenue * 100).toFixed(1)}%)`
                  : "";
                const label = (step.value >= 0 ? "+" : "") + formatCurrency(step.value) + pct;
                return (
                  <text x={x + width / 2} y={y - 6} textAnchor="middle"
                    fill="var(--text)" fontSize={9} fontFamily="DM Mono">
                    {label}
                  </text>
                );
              }}
            />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
      </div>

    </div>
  );
}
