import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones, visitasMensuales } from "@/lib/db/schema";
import { eq, or, and, sql } from "drizzle-orm";
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

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// One tenant per invocation (rotating), fetches visits for a batch of items via
// the multiget endpoint (up to 50 ids per call — single fast request).
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

  const pubs = await db.select({ itemId: publicaciones.itemId })
    .from(publicaciones)
    .where(and(eq(publicaciones.tenantId, tenant.id), eq(publicaciones.status, "active")))
    .limit(50);

  if (pubs.length === 0) return NextResponse.json({ ok: true, tenantId: tenant.id, message: "No active items" });

  // ML rechaza el formato de toISOString() ("...T00:00:00.000Z" con millis)
  // con 400 "unknown date format". Espera fecha simple YYYY-MM-DD.
  function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const now = new Date();
  const curKey  = monthKey(now);
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prevDate);

  const dateFromCur  = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const dateToCur    = ymd(now);
  const dateFromPrev = ymd(new Date(prevDate.getFullYear(), prevDate.getMonth(), 1));
  const dateToPrev   = ymd(new Date(now.getFullYear(), now.getMonth(), 0));

  const ids = pubs.map(p => p.itemId).join(",");

  let totalCur = 0, totalPrev = 0;

  try {
    const resCur = await fetch(
      `https://api.mercadolibre.com/items/visits?ids=${ids}&date_from=${dateFromCur}&date_to=${dateToCur}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const dataCur = await resCur.json();
    if (Array.isArray(dataCur)) {
      totalCur = dataCur.reduce((s: number, r: any) => s + (r.total_visits || 0), 0);
    } else {
      console.error("Visits cur: respuesta inesperada de ML", resCur.status, JSON.stringify(dataCur));
    }
  } catch (e) { console.error("Visits cur error:", e); }

  try {
    const resPrev = await fetch(
      `https://api.mercadolibre.com/items/visits?ids=${ids}&date_from=${dateFromPrev}&date_to=${dateToPrev}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const dataPrev = await resPrev.json();
    if (Array.isArray(dataPrev)) {
      totalPrev = dataPrev.reduce((s: number, r: any) => s + (r.total_visits || 0), 0);
    } else {
      console.error("Visits prev: respuesta inesperada de ML", resPrev.status, JSON.stringify(dataPrev));
    }
  } catch (e) { console.error("Visits prev error:", e); }

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

  return NextResponse.json({ ok: true, tenantId: tenant.id, curKey, totalCur, prevKey, totalPrev, itemsChecked: pubs.length });
}
