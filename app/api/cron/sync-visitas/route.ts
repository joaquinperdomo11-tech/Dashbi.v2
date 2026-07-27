import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, visitasMensuales, visitasDiarias } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function getAccessToken(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) return null;
    accessToken = refreshed.access_token;
    await db.update(mlTokens).set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(mlTokens.tenantId, tenant.id));
  }
  return accessToken;
}

function monthKey(dateStr: string) {
  // dateStr viene como "YYYY-MM-DD..."
  return dateStr.slice(0, 7);
}

// One tenant per invocation (rotating). Usa /users/{id}/items_visits/time_window,
// que trae el desglose DIARIO de visitas en un solo llamado (results: [{date, total}]).
// Reemplaza al enfoque anterior con /items/visits?ids=..., que solo acepta 1 id
// por vez ("maximum amount of items to query is 1") y no servía para totales
// agregados de cuenta ni para desglose diario.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));
  const eligible = activeTenants.filter(t => t.mlUserId);
  if (eligible.length === 0) return NextResponse.json({ ok: true, message: "No tenants" });

  const minuteSlot = Math.floor(Date.now() / 60000);
  const tenant = eligible[minuteSlot % eligible.length];

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  // last=65 cubre con margen el mes actual completo + el mes anterior completo
  // (peor caso: dos meses de 31 días = 62), en un solo llamado.
  const url = `https://api.mercadolibre.com/users/${tenant.mlUserId}/items_visits/time_window?last=65&unit=day`;

  let results: Array<{ date: string; total: number }> = [];
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await res.json();
    if (res.ok && Array.isArray(data.results)) {
      results = data.results;
    } else {
      console.error("Visits time_window: respuesta inesperada de ML", res.status, JSON.stringify(data));
      return NextResponse.json({ ok: false, tenantId: tenant.id, error: "ml_bad_response", body: data });
    }
  } catch (e) {
    console.error("Visits time_window fetch error:", e);
    return NextResponse.json({ ok: false, tenantId: tenant.id, error: "fetch_failed" });
  }

  // Guardar cada día. ML devuelve "date" como ISO datetime (ej "2026-07-08T00:00:00Z"),
  // lo normalizamos a YYYY-MM-DD.
  let daysWritten = 0;
  for (const r of results) {
    const fecha = String(r.date).slice(0, 10);
    await db.insert(visitasDiarias).values({
      tenantId: tenant.id, fecha, totalVisitas: r.total || 0, updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: [visitasDiarias.tenantId, visitasDiarias.fecha],
      set: { totalVisitas: r.total || 0, updatedAt: new Date() },
    });
    daysWritten++;
  }

  // Derivar totales mensuales (mes actual y anterior) sumando los días ya
  // obtenidos, sin llamadas extra a la API de ML.
  const now = new Date();
  const curKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const totalCur  = results.filter(r => monthKey(String(r.date)) === curKey).reduce((s, r) => s + (r.total || 0), 0);
  const totalPrev = results.filter(r => monthKey(String(r.date)) === prevKey).reduce((s, r) => s + (r.total || 0), 0);

  await db.insert(visitasMensuales).values({
    tenantId: tenant.id, monthKey: curKey, totalVisitas: totalCur, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [visitasMensuales.tenantId, visitasMensuales.monthKey],
    set: { totalVisitas: totalCur, updatedAt: new Date() },
  });

  await db.insert(visitasMensuales).values({
    tenantId: tenant.id, monthKey: prevKey, totalVisitas: totalPrev, updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [visitasMensuales.tenantId, visitasMensuales.monthKey],
    set: { totalVisitas: totalPrev, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, tenantId: tenant.id, daysWritten, curKey, totalCur, prevKey, totalPrev });
}
