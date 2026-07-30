import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones, syncCursors } from "@/lib/db/schema";
import { eq, or, and, ne } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

const SYNC_TYPE = "promociones";
const CONCURRENCY = 8; // llamadas simultáneas a ML para no tardar de más en una corrida diaria

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Respuesta de ML no está 100% documentada de forma consistente entre tipos de
// promoción (DEAL / PRICE_DISCOUNT / DOD) — parseo defensivo con varios nombres
// de campo posibles. Si esto no matchea bien contra la respuesta real, seguir el
// mismo patrón de debug que se usó para reputación/visitas (ver PROGRESO_DASHBI.md).
function parsePromoResponse(data: any) {
  let promos: any[] = [];
  if (Array.isArray(data)) promos = data;
  else if (data?.promotions && Array.isArray(data.promotions)) promos = data.promotions;
  else if (data && typeof data === "object" && Object.keys(data).length > 0) promos = [data];

  const activa = promos.find(p => p && (p.status === "started" || p.status === "active"));
  if (!activa) {
    return { promoActiva: false, promoTipo: null as string | null, promoPrecio: null as string | null, promoHasta: null as Date | null };
  }
  const precio = activa.deal_price ?? activa.price ?? activa.top_deal_price ?? null;
  const hasta = activa.finish_date ?? activa.end_date ?? activa.deadline ?? null;
  return {
    promoActiva: true,
    promoTipo: activa.type || activa.promotion_type || null,
    promoPrecio: precio !== null ? String(precio) : null,
    promoHasta: hasta ? new Date(hasta) : null,
  };
}

// Cron 1x/día: procesa el catálogo COMPLETO de un tenant por corrida (round-robin,
// el tenant menos-recientemente-sincronizado primero). A diferencia de los crons
// de cada minuto, acá no hace falta cursor incremental — con concurrencia
// controlada, recorrer 50-300 publicaciones entra cómodo en una sola invocación.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));
  const eligible = activeTenants.filter(t => t.mlUserId);
  if (eligible.length === 0) return NextResponse.json({ ok: true, message: "No tenants" });

  const cursors = await db.select().from(syncCursors).where(eq(syncCursors.syncType, SYNC_TYPE));
  const cursorByTenant = new Map(cursors.map(c => [c.tenantId, c]));

  const sorted = [...eligible].sort((a, b) => {
    const ca = cursorByTenant.get(a.id)?.updatedAt?.getTime() || 0;
    const cb = cursorByTenant.get(b.id)?.updatedAt?.getTime() || 0;
    return ca - cb;
  });
  const tenant = sorted[0];

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  // Solo publicaciones no cerradas — una publicación cerrada no puede tener promo activa.
  const pubs = await db.select().from(publicaciones)
    .where(and(eq(publicaciones.tenantId, tenant.id), ne(publicaciones.status, "closed")));

  let processed = 0;
  let activos = 0;
  const errores: string[] = [];

  for (const batch of chunk(pubs, CONCURRENCY)) {
    await Promise.all(batch.map(async (pub) => {
      try {
        const res = await fetch(
          `https://api.mercadolibre.com/seller-promotions/items/${pub.itemId}?app_version=v2`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) {
          // 404 es normal: significa "sin promociones para este item", no un error real.
          if (res.status !== 404) errores.push(`${pub.itemId}: HTTP ${res.status}`);
          await db.update(publicaciones).set({
            promoActiva: false, promoTipo: null, promoPrecio: null, promoHasta: null,
          }).where(eq(publicaciones.id, pub.id));
          processed++;
          return;
        }
        const data = await res.json();
        const parsed = parsePromoResponse(data);
        await db.update(publicaciones).set(parsed).where(eq(publicaciones.id, pub.id));
        if (parsed.promoActiva) activos++;
        processed++;
      } catch (e: any) {
        errores.push(`${pub.itemId}: ${e?.message || e}`);
        processed++;
      }
    }));
  }

  await db.insert(syncCursors).values({
    tenantId: tenant.id, syncType: SYNC_TYPE, updatedAt: new Date(), lastFullSync: new Date(),
  }).onConflictDoUpdate({
    target: [syncCursors.tenantId, syncCursors.syncType],
    set: { updatedAt: new Date(), lastFullSync: new Date() },
  });

  return NextResponse.json({
    ok: true, tenantId: tenant.id, processed, activos,
    errores: errores.slice(0, 10), // primeros 10, para no inflar la respuesta
  });
}
