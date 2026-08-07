"use client";

import { useEffect, useState } from "react";

/**
 * Página de debug TEMPORAL — borrar junto con /api/debug/ads-raw una vez
 * confirmado el acceso a Product Ads y la forma real de los datos.
 */
export default function DebugAdsPage() {
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/debug/ads-raw")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 24, fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Debug: Product Ads (Mercado Ads)</h1>
      {loading && <p>Cargando...</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {data ? (
        <pre
          style={{
            background: "#111",
            color: "#0f0",
            padding: 16,
            borderRadius: 8,
            overflow: "auto",
            fontSize: 12,
            maxHeight: "80vh",
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
