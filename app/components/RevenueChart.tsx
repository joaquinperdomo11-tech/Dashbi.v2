"use client";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useState, useMemo } from "react";

interface RevenueChartProps {
  byDay: { date: string; revenue: number; margen: number; orders: number }[];
  byMonth: { month: string; revenue: number; margen: number; orders: number }[];
  currentMonthByDay: { day: number; revenue: number; margen: number; orders: number }[];
  prevMonthByDay: { day: number; revenue: number; margen: number; orders: number }[];
}

function formatCurrency(value: number) {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

const ComparisonTooltip = ({ active, payload, label, metric }: any) => {
  if (!active || !payload?.length) return null;
  const cur  = payload.find((p: any) => p.dataKey === `cur_${metric}`);
  const prev = payload.find((p: any) => p.dataKey === `prev_${metric}`);
  const pct  = prev?.value > 0 ? ((cur?.value - prev?.value) / prev?.value) * 100 : null;

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-3 shadow-xl min-w-[160px]">
      <p className="text-brand-sub text-xs mb-2 font-mono">Día {label}</p>
      <div className="space-y-1">
        {cur && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-brand-text">Mes actual</span>
            <span className="text-xs font-mono font-bold text-brand-text">
              {metric === "orders" ? cur.value : metric === "margen" ? `${(cur.value || 0).toFixed(1)}%` : formatCurrency(cur.value || 0)}
            </span>
          </div>
        )}
        {prev && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-brand-sub">Mes anterior</span>
            <span className="text-xs font-mono text-brand-sub">
              {metric === "orders" ? prev.value : metric === "margen" ? `${(prev.value || 0).toFixed(1)}%` : formatCurrency(prev.value || 0)}
            </span>
          </div>
        )}
        {pct !== null && (
          <div className={`text-xs font-mono font-bold mt-1 ${pct >= 0 ? "text-green-400" : "text-red-400"}`}>
            {pct >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% vs mes anterior
          </div>
        )}
      </div>
    </div>
  );
};

export default function RevenueChart({ currentMonthByDay, prevMonthByDay }: RevenueChartProps) {
  const [metric, setMetric] = useState<"revenue" | "margen" | "orders">("revenue");

  const now         = new Date();
  const monthNames  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesActual   = monthNames[now.getMonth()];
  const mesAnterior = monthNames[now.getMonth() === 0 ? 11 : now.getMonth() - 1];

  const maxDays = Math.max(
    currentMonthByDay.length,
    prevMonthByDay.length > 0 ? Math.max(...prevMonthByDay.map(d => d.day)) : 0
  );

  const comparisonData = useMemo(() => {
    const allDays = Array.from({ length: maxDays }, (_, i) => i + 1);
    return allDays.map(d => {
      const cur  = currentMonthByDay.find(x => x.day === d);
      const prev = prevMonthByDay.find(x => x.day === d);
      const curVal  = cur  ? (metric === "margen" && cur.revenue  > 0 ? (cur.margen  / cur.revenue)  * 100 : cur[metric  as keyof typeof cur]  as number) : null;
      const prevVal = prev ? (metric === "margen" && prev.revenue > 0 ? (prev.margen / prev.revenue) * 100 : prev[metric as keyof typeof prev] as number) : null;
      return {
        day: d,
        [`cur_${metric}`]:  curVal,
        [`prev_${metric}`]: prevVal,
      };
    });
  }, [currentMonthByDay, prevMonthByDay, metric, maxDays]);

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-brand-text text-lg">
            {mesActual} vs {mesAnterior}
          </h3>
          <p className="text-brand-sub text-sm mt-0.5">
            Día a día · mes anterior completo en punteado
          </p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-brand-border">
          {(["revenue", "margen", "orders"] as const).map(m => (
            <button key={m} onClick={() => setMetric(m)}
              className={`px-2.5 py-1.5 text-xs font-mono transition-all ${metric === m ? "text-brand-text text-brand-dark font-bold" : "text-brand-sub hover:text-brand-text"}`}>
              {m === "revenue" ? "Ingresos" : m === "margen" ? "Rentabilidad" : "Órdenes"}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={comparisonData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <defs>
            <linearGradient id="curGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="var(--accent)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
          <XAxis dataKey="day"
            tick={{ fill: "#8888AA", fontSize: 10, fontFamily: "DM Mono" }}
            axisLine={false} tickLine={false}
            tickFormatter={v => v % 5 === 0 ? `${v}` : ""}
          />
          <YAxis
            tick={{ fill: "#8888AA", fontSize: 10, fontFamily: "DM Mono" }}
            axisLine={false} tickLine={false} width={52}
            tickFormatter={metric === "orders" ? undefined : metric === "margen" ? v => `${v.toFixed(0)}%` : formatCurrency}
          />
          <Tooltip content={<ComparisonTooltip metric={metric} />} cursor={{ stroke: "var(--accent)", strokeWidth: 0.5, strokeDasharray: "4 4" }} />
          <Area
            type="monotone" dataKey={`prev_${metric}`}
            stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3"
            fill="transparent" dot={false} connectNulls={false}
          />
          <Area
            type="monotone" dataKey={`cur_${metric}`}
            stroke="var(--accent)" strokeWidth={2}
            fill="url(#curGrad)" dot={false} connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex gap-6 mt-3 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-6 text-brand-text" style={{ height: 2 }} />
          <span className="text-brand-sub text-xs font-mono">{mesActual}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="24" height="2"><line x1="0" y1="1" x2="24" y2="1" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
          <span className="text-brand-sub text-xs font-mono">{mesAnterior} (completo)</span>
        </div>
      </div>
    </div>
  );
}
