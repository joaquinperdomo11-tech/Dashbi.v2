"use client";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";

interface DiaVisitas { fecha: string; dia: number; visitas: number; ordenes: number; conversion: number; }
interface VisitasConversionChartProps {
  current: { monthKey: string; days: DiaVisitas[] };
  previous: { monthKey: string; days: DiaVisitas[] };
}

const ComparisonTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const curV = payload.find((p: any) => p.dataKey === "cur_visitas");
  const prevV = payload.find((p: any) => p.dataKey === "prev_visitas");
  const curC = payload.find((p: any) => p.dataKey === "cur_conversion");
  const prevC = payload.find((p: any) => p.dataKey === "prev_conversion");

  return (
    <div className="bg-brand-card border border-brand-border rounded-xl p-3 shadow-xl min-w-[180px]">
      <p className="text-brand-sub text-xs mb-2 font-mono">Día {label}</p>
      <div className="space-y-1">
        {curV != null && curV.value != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-brand-text">Visitas (actual)</span>
            <span className="text-xs font-mono font-bold text-brand-text">{curV.value}</span>
          </div>
        )}
        {prevV != null && prevV.value != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-brand-sub">Visitas (anterior)</span>
            <span className="text-xs font-mono text-brand-sub">{prevV.value}</span>
          </div>
        )}
        {curC != null && curC.value != null && (
          <div className="flex items-center justify-between gap-4 mt-1 pt-1 border-t border-brand-border">
            <span className="text-xs font-mono text-brand-text">Conversión (actual)</span>
            <span className="text-xs font-mono font-bold text-brand-text">{curC.value.toFixed(2)}%</span>
          </div>
        )}
        {prevC != null && prevC.value != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-mono text-brand-sub">Conversión (anterior)</span>
            <span className="text-xs font-mono text-brand-sub">{prevC.value.toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default function VisitasConversionChart({ current, previous }: VisitasConversionChartProps) {
  const now = new Date();
  const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const mesActual = monthNames[now.getMonth()];
  const mesAnterior = monthNames[now.getMonth() === 0 ? 11 : now.getMonth() - 1];

  const maxDays = Math.max(
    current.days.length > 0 ? Math.max(...current.days.map(d => d.dia)) : 0,
    previous.days.length > 0 ? Math.max(...previous.days.map(d => d.dia)) : 0,
  );

  const data = useMemo(() => {
    const allDays = Array.from({ length: maxDays }, (_, i) => i + 1);
    return allDays.map(d => {
      const cur = current.days.find(x => x.dia === d);
      const prev = previous.days.find(x => x.dia === d);
      return {
        day: d,
        cur_visitas: cur ? cur.visitas : null,
        prev_visitas: prev ? prev.visitas : null,
        cur_conversion: cur ? cur.conversion : null,
        prev_conversion: prev ? prev.conversion : null,
      };
    });
  }, [current, previous, maxDays]);

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-brand-text text-lg">
            Visitas y conversión — {mesActual} vs {mesAnterior}
          </h3>
          <p className="text-brand-sub text-sm mt-0.5">
            Barras: visitas por día · Línea: % conversión · mes anterior en punteado
          </p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" vertical={false} />
          <XAxis dataKey="day"
            tick={{ fill: "#8888AA", fontSize: 10, fontFamily: "DM Mono" }}
            axisLine={false} tickLine={false}
            tickFormatter={v => v % 5 === 0 ? `${v}` : ""}
          />
          <YAxis yAxisId="visitas"
            tick={{ fill: "#8888AA", fontSize: 10, fontFamily: "DM Mono" }}
            axisLine={false} tickLine={false} width={42}
          />
          <YAxis yAxisId="conversion" orientation="right"
            tick={{ fill: "#8888AA", fontSize: 10, fontFamily: "DM Mono" }}
            axisLine={false} tickLine={false} width={44}
            tickFormatter={v => `${v.toFixed(0)}%`}
          />
          <Tooltip content={<ComparisonTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />

          <Bar yAxisId="visitas" dataKey="prev_visitas" fill="var(--muted)" fillOpacity={0.35} radius={[3, 3, 0, 0]} />
          <Bar yAxisId="visitas" dataKey="cur_visitas" fill="var(--accent)" fillOpacity={0.85} radius={[3, 3, 0, 0]} />

          <Line yAxisId="conversion" type="monotone" dataKey="prev_conversion"
            stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />
          <Line yAxisId="conversion" type="monotone" dataKey="cur_conversion"
            stroke="#22C55E" strokeWidth={2} dot={false} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex gap-6 mt-3 justify-center flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--accent)" }} />
          <span className="text-brand-sub text-xs font-mono">Visitas {mesActual}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--muted)", opacity: 0.35 }} />
          <span className="text-brand-sub text-xs font-mono">Visitas {mesAnterior}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="2"><line x1="0" y1="1" x2="20" y2="1" stroke="#22C55E" strokeWidth="2"/></svg>
          <span className="text-brand-sub text-xs font-mono">Conversión {mesActual}</span>
        </div>
        <div className="flex items-center gap-2">
          <svg width="20" height="2"><line x1="0" y1="1" x2="20" y2="1" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4,3"/></svg>
          <span className="text-brand-sub text-xs font-mono">Conversión {mesAnterior}</span>
        </div>
      </div>
    </div>
  );
}
