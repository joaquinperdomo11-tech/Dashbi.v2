"use client";

import { useEffect, useState } from "react";

type Campaña = {
  campaignId: string;
  name: string;
  status: string;
  acosTarget: number | null;
  budget: number | null;
  cost: number;
  unitsQuantity: number;
  acos: number;
  roas: number;
};

type Recomendacion = {
  tipo: "item" | "campania" | "cuenta";
  prioridad: "alta" | "media" | "baja";
  itemId: string | null;
  campaignId: string | null;
  titulo: string;
  descripcion: string;
  accionSugerida: string;
};

type AdsData = {
  productAdsEnabled: boolean;
  campañas: Campaña[];
  semana: string | null;
  recomendaciones: Recomendacion[];
};

const PRIORIDAD_COLOR: Record<string, string> = {
  alta: "#EF4444",
  media: "#F59E0B",
  baja: "#6B7280",
};

const PRIORIDAD_LABEL: Record<string, string> = {
  alta: "Prioridad alta",
  media: "Prioridad media",
  baja: "Prioridad baja",
};

function formatMoney(n: number) {
  return n.toLocaleString("es-UY", { style: "currency", currency: "UYU", maximumFractionDigits: 0 });
}

export default function PublicidadPage() {
  const [data, setData] = useState<AdsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/data/ads")
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Cargando...</div>;
  }

  if (!data?.productAdsEnabled) {
    return (
      <div style={{ padding: 24, maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 12 }}>Publicidad</h1>
        <p style={{ color: "var(--text-sub, #6B7280)" }}>
          No detectamos Product Ads activo en tu cuenta de MercadoLibre. Activalo desde Mercado
          Libre &gt; Gestión de publicaciones &gt; Campaña de publicidad, y volvé a esta página en
          unas horas (el sync corre automáticamente todos los días).
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Publicidad</h1>
      <p style={{ color: "var(--text-sub, #6B7280)", marginBottom: 24, fontSize: 14 }}>
        Recomendaciones automáticas sobre tus campañas de Product Ads — solo lectura, no se
        ejecuta ningún cambio en Mercado Libre.
      </p>

      {/* Resumen de campañas */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Campañas activas</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {data.campañas.map((c) => {
            const excedeAcos = c.acosTarget !== null && c.acos > c.acosTarget;
            return (
              <div
                key={c.campaignId}
                style={{
                  border: "1px solid var(--border, #E5E7EB)",
                  borderRadius: 12,
                  padding: 16,
                  background: "var(--card, #fff)",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-sub, #6B7280)", marginBottom: 8 }}>
                  {c.status === "active" ? "Activa" : c.status}
                </div>
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <span>ACOS real</span>
                  <span style={{ color: excedeAcos ? "#EF4444" : undefined, fontWeight: 600 }}>
                    {c.acos.toFixed(1)}%
                    {c.acosTarget !== null && (
                      <span style={{ color: "var(--text-sub, #6B7280)", fontWeight: 400 }}>
                        {" "}
                        / obj. {c.acosTarget}%
                      </span>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <span>Gastado (7d)</span>
                  <span>{formatMoney(c.cost)}</span>
                </div>
                <div style={{ fontSize: 13, display: "flex", justifyContent: "space-between" }}>
                  <span>Ventas (7d)</span>
                  <span>{c.unitsQuantity}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Recomendaciones */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
          Recomendaciones {data.semana ? `— semana del ${data.semana}` : ""}
        </h2>
        {data.recomendaciones.length === 0 ? (
          <p style={{ color: "var(--text-sub, #6B7280)", fontSize: 14, marginTop: 12 }}>
            Todavía no hay recomendaciones generadas. El análisis corre automáticamente 1 vez por
            semana una vez que haya al menos 7 días de datos sincronizados.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
            {data.recomendaciones.map((r, idx) => (
              <div
                key={idx}
                style={{
                  border: "1px solid var(--border, #E5E7EB)",
                  borderLeft: `4px solid ${PRIORIDAD_COLOR[r.prioridad]}`,
                  borderRadius: 10,
                  padding: 16,
                  background: "var(--card, #fff)",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: PRIORIDAD_COLOR[r.prioridad],
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  {PRIORIDAD_LABEL[r.prioridad]}
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.titulo}</div>
                <div style={{ fontSize: 14, color: "var(--text-sub, #374151)", marginBottom: 8 }}>
                  {r.descripcion}
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>👉 {r.accionSugerida}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
