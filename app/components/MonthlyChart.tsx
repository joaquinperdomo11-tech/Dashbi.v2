"use client";
import { useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

interface RevenueMonth {
  month: string;
  revenue: number;
  margen: number;
  orders: number;
}

interface Props {
  revenueByMonth: RevenueMonth[];
}

const MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${MONTH_SHORT[parseInt(m) - 1]}`;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString("es-UY")}`;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const isCurYear = d?.year === new Date().getFullYear();
  return (
    <div className="bg-brand-card border border-brand-border rounded-xl px-4 py-3 shadow-xl min-w-[180px]">
      <p className="text-brand-sub text-xs font-mono mb-2">{label}</p>
      {payload.map((p: any) => {
        if (p.dataKey === "revenue") {
          return (
            <div key="revenue">
              <div className="flex items-center justify-between gap-4 text-xs font-mono">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: "var(--green)" }} />
                  <span className="text-brand-sub">Ingresos {d?.year}:</span>
                </div>
                <span className="font-bold" style={{ color: "var(--green)" }}>{fmt(p.value || 0)}</span>
              </div>
              {isCurYear && d?.revenuePrev > 0 && (
                <div className="flex items-center justify-between gap-4 text-xs font-mono mt-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-brand-muted" />
                    <span className="text-brand-sub">Ingresos {d.year - 1}:</span>
                  </div>
                  <span className="font-bold text-brand-sub">{fmt(d.revenuePrev)}</span>
                </div>
              )}
            </div>
          );
        }
        if (p.dataKey === "margenPct" && p.value !== null) {
          return (
            <div key="margen" className="flex items-center justify-between gap-4 text-xs font-mono mt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: "var(--green)" }} />
                <span className="text-brand-sub">Rentabilidad:</span>
              </div>
              <span className="font-bold" style={{ color: "var(--green)" }}>{(p.value || 0).toFixed(1)}%</span>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
};

export default function MonthlyChart({ revenueByMonth }: Props) {
  const now = new Date();
  const curYear  = now.getFullYear();
  const prevYear = curYear - 1;

  // Build last 12 months (rolling), SPLY bars for comparison
  const chartData = useMemo(() => {
    const byKey: Record<string, RevenueMonth> = {};
    revenueByMonth.forEach(m => { byKey[m.month] = m; });

    const data = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(curYear, now.getMonth() - i, 1);
      const curKey  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const prevKey = `${d.getFullYear() - 1}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const cur  = byKey[curKey];
      const prev = byKey[prevKey];
      data.push({
        label:        `${MONTH_SHORT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        year:         d.getFullYear(),
        revenue:      cur?.revenue || 0,
        revenuePrev:  prev?.revenue || 0,
        margenPct:    cur && cur.revenue > 0 ? (cur.margen / cur.revenue) * 100 : null,
      });
    }
    return data;
  }, [revenueByMonth, curYear]);

  // Summary: only sum months that belong to curYear
  const totalCur  = chartData.filter(d => d.year === curYear).reduce((s, d) => s + d.revenue, 0);
  const totalPrev = chartData.filter(d => d.year === prevYear).reduce((s, d) => s + d.revenue, 0);
  const diff      = totalPrev > 0 ? ((totalCur - totalPrev) / totalPrev) * 100 : 0;

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
        <div>
          <h3 className="font-display font-semibold text-brand-text text-lg">Últimos 12 meses</h3>
          <p className="text-brand-sub text-sm mt-0.5">{curYear} vs {prevYear}</p>
        </div>
        <div className="flex gap-4 flex-wrap">
          <div className="text-right">
            <p className="text-brand-sub text-xs font-mono uppercase">Ingresos {curYear}</p>
            <p className="text-brand-yellow font-display font-bold text-xl">{fmt(totalCur)}</p>
            <p className={`text-xs font-mono ${diff >= 0 ? "text-green-400" : "text-red-400"}`}>
              {diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toFixed(1)}% vs mismo período {prevYear}
            </p>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
            width={42}
            tickFormatter={fmt}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "monospace" }}
            tickLine={false} axisLine={false}
            width={42}
            tickFormatter={v => `${v.toFixed(1)}%`}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 11, fontFamily: "monospace", paddingTop: 8 }}
            formatter={(value) => <span style={{ color: "#9ca3af" }}>{value}</span>}
          />
          <Bar yAxisId="left" dataKey="revenue" name="Ingresos" radius={[3,3,0,0]} maxBarSize={22} opacity={0.9}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.year === curYear ? "var(--green)" : "var(--sub)"} opacity={entry.year === curYear ? 0.9 : 0.65} />
            ))}
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey="margenPct" name="Rentabilidad %" stroke="var(--green)" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
