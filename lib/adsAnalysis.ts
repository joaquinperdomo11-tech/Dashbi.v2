// Lógica determinística del análisis semanal de Mercado Ads (Product Ads).
// No usa IA — calcula, por cada anuncio y campaña, señales objetivas
// (ACOS real vs objetivo, margen real después de Ads, plata gastada sin
// ventas, etc.) y arma una lista de "candidatos" que luego se le pasan a
// Gemini en un solo llamado para que redacte el reporte final priorizado.

export type ItemSnapshot = {
  itemId: string;
  campaignId: string;
  title: string | null;
  price: number;
  status: string | null;
  clicks: number;
  cost: number;
  unitsQuantity: number;
  acos: number;
  roas: number;
};

export type CampaignInfo = {
  campaignId: string;
  name: string;
  status: string;
  acosTarget: number | null;
  budget: number | null;
  cost: number;
  unitsQuantity: number;
  acos: number;
};

export type CostoPorSku = Record<string, number>; // sku -> costoSinIva

// Publicación ML: para cruzar item_id -> sku -> costo. Se asume que ya
// tenés item_id/SKU en `publicaciones` (mismo patrón que el resto del app).
export type PublicacionMin = {
  itemId: string;
  sku: string | null;
  price: number | null;
};

export type Candidato = {
  tipo: "item" | "campania" | "cuenta";
  prioridad: "alta" | "media" | "baja";
  itemId?: string;
  campaignId?: string;
  señal: string; // descripción corta y objetiva de qué se detectó, en texto plano
  datos: Record<string, number | string | null>;
};

const COMISION_ML_ESTIMADA = 0.13; // fallback si no hay dato real de comisión disponible en este cruce

/**
 * Calcula el margen real de un ítem (precio - costo - comisión estimada - costo de Ads)
 * como % sobre el precio. Devuelve null si no hay costo cargado para el SKU.
 */
function margenRealPct(precio: number, costo: number | null, costoAdsPorUnidad: number): number | null {
  if (costo === null || precio <= 0) return null;
  const margenBruto = precio - costo - precio * COMISION_ML_ESTIMADA;
  const margenNeto = margenBruto - costoAdsPorUnidad;
  return (margenNeto / precio) * 100;
}

export function construirCandidatos(
  items: ItemSnapshot[],
  campañas: CampaignInfo[],
  publicaciones: PublicacionMin[],
  costos: CostoPorSku
): Candidato[] {
  const candidatos: Candidato[] = [];
  const pubPorItemId = new Map(publicaciones.map((p) => [p.itemId, p]));
  const campañaPorId = new Map(campañas.map((c) => [c.campaignId, c]));

  // --- Nivel ítem ---
  for (const item of items) {
    const pub = pubPorItemId.get(item.itemId);
    const sku = pub?.sku ?? null;
    const costo = sku && costos[sku] !== undefined ? costos[sku] : null;
    const costoAdsPorUnidad = item.unitsQuantity > 0 ? item.cost / item.unitsQuantity : 0;
    const campaña = campañaPorId.get(item.campaignId);
    const acosTarget = campaña?.acosTarget ?? null;

    // 1. Gastando plata sin ninguna venta en la semana
    if (item.clicks >= 15 && item.unitsQuantity === 0 && item.cost > 0) {
      candidatos.push({
        tipo: "item",
        prioridad: "alta",
        itemId: item.itemId,
        campaignId: item.campaignId,
        señal: "Clics e inversión sin ninguna venta en la semana",
        datos: {
          titulo: item.title,
          clicks: item.clicks,
          costo: item.cost,
          campaña: campaña?.name ?? item.campaignId,
        },
      });
      continue; // ya es candidato claro, no seguir evaluando este ítem
    }

    // 2. ACOS real muy por encima del objetivo de la campaña
    if (acosTarget !== null && item.unitsQuantity > 0 && item.acos > acosTarget * 1.5) {
      candidatos.push({
        tipo: "item",
        prioridad: "alta",
        itemId: item.itemId,
        campaignId: item.campaignId,
        señal: "ACOS real muy por encima del objetivo de la campaña",
        datos: {
          titulo: item.title,
          acosReal: item.acos,
          acosObjetivo: acosTarget,
          costo: item.cost,
          campaña: campaña?.name ?? item.campaignId,
        },
      });
    }

    // 3. Margen real negativo después de Ads (si hay costo cargado)
    if (costo !== null) {
      const margen = margenRealPct(item.price, costo, costoAdsPorUnidad);
      if (margen !== null && margen < 0 && item.unitsQuantity > 0) {
        candidatos.push({
          tipo: "item",
          prioridad: "alta",
          itemId: item.itemId,
          campaignId: item.campaignId,
          señal: "Margen real negativo después de descontar el costo de Ads",
          datos: {
            titulo: item.title,
            margenPct: Number(margen.toFixed(1)),
            precio: item.price,
            costo,
            costoAdsPorUnidad: Number(costoAdsPorUnidad.toFixed(2)),
            campaña: campaña?.name ?? item.campaignId,
          },
        });
      } else if (margen !== null && margen > 15 && item.unitsQuantity >= 2 && item.acos < (acosTarget ?? 999) * 0.6) {
        // 4. Buen margen + ACOS cómodo respecto al objetivo → candidato a subir presupuesto/puja
        candidatos.push({
          tipo: "item",
          prioridad: "media",
          itemId: item.itemId,
          campaignId: item.campaignId,
          señal: "Buen margen real y ACOS cómodo — candidato a más inversión",
          datos: {
            titulo: item.title,
            margenPct: Number(margen.toFixed(1)),
            acosReal: item.acos,
            acosObjetivo: acosTarget,
            campaña: campaña?.name ?? item.campaignId,
          },
        });
      }
    }
  }

  // --- Nivel campaña ---
  for (const c of campañas) {
    if (c.status !== "active") continue;

    if (c.acosTarget !== null && c.unitsQuantity > 0 && c.acos > c.acosTarget * 1.3) {
      candidatos.push({
        tipo: "campania",
        prioridad: "media",
        campaignId: c.campaignId,
        señal: "ACOS de la campaña por encima del objetivo",
        datos: { campaña: c.name, acosReal: c.acos, acosObjetivo: c.acosTarget, costo: c.cost },
      });
    }

    if (c.budget !== null && c.cost >= c.budget * 0.95) {
      candidatos.push({
        tipo: "campania",
        prioridad: "baja",
        campaignId: c.campaignId,
        señal: "Presupuesto de la campaña casi agotado en la semana",
        datos: { campaña: c.name, presupuesto: c.budget, gastado: c.cost },
      });
    }
  }

  // --- Nivel cuenta: productos rentables sin ninguna presencia en Ads ---
  const itemIdsEnAds = new Set(items.map((i) => i.itemId));
  const publicacionesConCosto = publicaciones.filter((p) => p.sku && costos[p.sku] !== undefined);
  let rentablesSinAds = 0;
  for (const p of publicacionesConCosto) {
    if (itemIdsEnAds.has(p.itemId)) continue;
    const costo = costos[p.sku as string];
    const precio = p.price ?? 0;
    const margen = margenRealPct(precio, costo, 0);
    if (margen !== null && margen > 20) rentablesSinAds++;
  }
  if (rentablesSinAds >= 3) {
    candidatos.push({
      tipo: "cuenta",
      prioridad: "media",
      señal: "Hay varios productos rentables que no están en ninguna campaña de Ads",
      datos: { cantidad: rentablesSinAds },
    });
  }

  return candidatos;
}
