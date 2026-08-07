import type { Candidato } from "@/lib/adsAnalysis";

// Llama a Gemini Flash (Google AI Studio, free tier) UNA sola vez por tenant
// con la lista de candidatos ya calculada en código (ver lib/adsAnalysis.ts).
// Gemini no decide señales por su cuenta — solo prioriza, redacta y arma el
// texto final para mostrar en /publicidad. Requiere GEMINI_API_KEY en el
// entorno de Vercel.

export type RecomendacionFinal = {
  tipo: "item" | "campania" | "cuenta";
  prioridad: "alta" | "media" | "baja";
  itemId?: string;
  campaignId?: string;
  titulo: string;
  descripcion: string;
  accionSugerida: string;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function construirPrompt(candidatos: Candidato[], nombreTienda: string): string {
  return `Sos un analista de Mercado Ads (Product Ads) para el vendedor "${nombreTienda}" en Mercado Libre Uruguay.

Te paso una lista de "candidatos" ya detectados por un cálculo determinístico (ACOS real vs objetivo, margen real después de publicidad, gasto sin ventas, etc.). Tu trabajo es:
1. Redactar cada uno como una recomendación clara y accionable para el vendedor, en español rioplatense, tono directo y profesional.
2. Ajustar la prioridad si te parece que el cálculo automático se equivocó (podés bajar o subir prioridad si el contexto lo justifica).
3. NO inventar datos que no estén en la lista de candidatos. Si un dato no está, no lo menciones.
4. Nunca recomendar acciones que Mercado Ads no permite (esto es un reporte de solo lectura, no vas a ejecutar nada).

Candidatos detectados (JSON):
${JSON.stringify(candidatos, null, 2)}

Devolvé SOLO un array JSON (sin texto antes ni después, sin \`\`\`), con este formato exacto por cada recomendación:
[
  {
    "tipo": "item" | "campania" | "cuenta",
    "prioridad": "alta" | "media" | "baja",
    "itemId": "opcional, solo si tipo es item",
    "campaignId": "opcional, solo si tipo es item o campania",
    "titulo": "título corto de la recomendación, máx 80 caracteres",
    "descripcion": "explicación de 1-2 oraciones de qué se detectó y por qué importa",
    "accionSugerida": "qué hacer concretamente, en 1 oración, sin ejecutar nada automáticamente"
  }
]

Si la lista de candidatos está vacía, devolvé un array vacío [].`;
}

export async function generarRecomendaciones(
  candidatos: Candidato[],
  nombreTienda: string
): Promise<RecomendacionFinal[]> {
  if (candidatos.length === 0) return [];

  const prompt = construirPrompt(candidatos, nombreTienda);

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const rawText: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return [];

  try {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    // Si Gemini devuelve algo no parseable, no rompemos el cron —
    // simplemente no se generan recomendaciones esa semana para este tenant.
    return [];
  }
}
