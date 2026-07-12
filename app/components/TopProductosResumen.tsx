"use client";
import { useMemo, useState } from "react";
import type { Order } from "@/lib/sheets";

interface Props {
  orders: Order[];
  costos?: Record<string, number>;
}

const IVA = 1.22;
const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function getCurMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function TopProductosResumen({ orders, costos = {} }: Props) {
  const availableMonths = useMemo(() => {
    const s = new Set<string>();
    orders.forEach(o => {
      const d = new Date(o.fecha);
      if (!isNaN(d.getTime())) s.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(s).sort().reverse();
  }, [orders]);

  const [selectedMonth, setSelectedMonth] = useState<string>(getCurMonth());

  const top10 = useMemo(() => {
    const filtered = orders.filter(o => {
      const d = new Date(o.fecha);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === selectedMonth;
    });

    const map: Record<string, { sku: string; units: number; revenue: number; rent: number }> = {};
    filtered.forEach(o => {
      if (!map[o.producto]) map[o.producto] = { sku: o.sku, units: 0, revenue: 0, rent: 0 };
      const costo = (costos[o.sku] || 0) * IVA * o.cantidad;
      map[o.producto].units   += o.cantidad;
      map[o.producto].revenue += o.totalItem;
      map[o.producto].rent    += o.totalItem - o.comisionML - (o.shippingCostSeller - o.bonificacionEnvio) - costo;
    });

    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [orders, selectedMonth, costos]);

  const maxRevenue = Math.max(...top10.map(p => p.revenue), 1);

  const monthLabel = (m: string) => {
    const [y, mo] = m.split("-");
    return `${MONTHS[parseInt(mo) - 1]} ${y.slice(2)}`;
  };

  return (
    <div className="bg-brand-card border border-brand-border rounded-2xl p-5">
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="font-display font-semibold text-brand-text text-lg">Top 10 productos</h3>
          <p className="text-brand-sub text-xs font-mono mt-0.5">Por ingresos</p>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-0.5 max-w-full" style={{scrollbarWidth:"none"}}>
          {availableMonths.slice(0, 6).map(m => (
            <button key={m} onClick={() => setSelectedMonth(m)}
              className="flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-mono transition-all border"
              style={{
                background: selectedMonth === m ? "var(--green)" : "transparent",
                color: selectedMonth === m ? "#fff" : "var(--sub)",
                borderColor: selectedMonth === m ? "var(--green)" : "var(--border)",
                fontWeight: selectedMonth === m ? 600 : 400,
              }}>
              {monthLabel(m)}
            </button>
          ))}
        </div>
      </div>

      {top10.length === 0 ? (
        <p className="text-brand-muted text-xs font-mono text-center py-8">Sin ventas en {monthLabel(selectedMonth)}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {top10.map((p, i) => {
            const pct = (p.revenue / maxRevenue) * 100;
            const rentPct = p.revenue > 0 ? (p.rent / p.revenue) * 100 : 0;
            return (
              <div key={p.sku || i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)", width: 16, textAlign: "right", flexShrink: 0 }}>
                  {i + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                    <p className="text-brand-text" style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "55%" }}>
                      {p.name.length > 38 ? p.name.slice(0, 38) + "…" : p.name}
                    </p>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                      <span className="text-brand-sub" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>{p.units} ud</span>
                      <span className="text-brand-yellow" style={{ fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 700 }}>{fmt(p.revenue)}</span>
                      <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: rentPct >= 0 ? "#1D9E75" : "#E24B4A", fontWeight: 500, minWidth: 36 }}>
                        {costos[p.sku] ? `${rentPct.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--color-border-tertiary)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: i === 0 ? "#FFE500" : "#4a4a6a", borderRadius: 2 }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
