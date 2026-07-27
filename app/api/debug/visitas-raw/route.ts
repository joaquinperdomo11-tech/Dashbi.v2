import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" });

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ error: "No token" });

  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (refreshed.access_token) accessToken = refreshed.access_token;
  }

  const pubs = await db.select({ itemId: publicaciones.itemId })
    .from(publicaciones)
    .where(and(eq(publicaciones.tenantId, tenant.id), eq(publicaciones.status, "active")))
    .limit(5);

  const now = new Date();
  function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const dateFrom = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  const dateTo = ymd(now);

  const diagnostics: any = {
    tenantId: tenant.id,
    mlUserId: tenant.mlUserId,
    activePublicacionesCount: pubs.length,
    itemIdsSample: pubs.map(p => p.itemId),
    monthKey: monthKey(now),
    dateFrom,
    dateTo,
  };

  if (pubs.length === 0) {
    diagnostics.error = "No hay publicaciones con status='active' para este tenant. Revisar sync-publicaciones primero.";
    return NextResponse.json(diagnostics);
  }

  // Test 1: multiget con TODOS los ids de la muestra (lo que hace el cron)
  const idsMulti = pubs.map(p => p.itemId).join(",");
  const urlMulti = `https://api.mercadolibre.com/items/visits?ids=${idsMulti}&date_from=${dateFrom}&date_to=${dateTo}`;
  const resMulti = await fetch(urlMulti, { headers: { Authorization: `Bearer ${accessToken}` } });
  const bodyMulti = await resMulti.json();
  diagnostics.test_multiget = {
    url: urlMulti,
    httpStatus: resMulti.status,
    isArray: Array.isArray(bodyMulti),
    body: bodyMulti,
  };

  // Test 2: un solo id, para descartar problema de multiget con varios ids a la vez
  const singleId = pubs[0].itemId;
  const urlSingle = `https://api.mercadolibre.com/items/visits?ids=${singleId}&date_from=${dateFrom}&date_to=${dateTo}`;
  const resSingle = await fetch(urlSingle, { headers: { Authorization: `Bearer ${accessToken}` } });
  const bodySingle = await resSingle.json();
  diagnostics.test_single = {
    url: urlSingle,
    httpStatus: resSingle.status,
    isArray: Array.isArray(bodySingle),
    body: bodySingle,
  };

  // Test 3: endpoint alternativo a nivel de usuario (total de todas las publicaciones)
  const urlUser = `https://api.mercadolibre.com/users/${tenant.mlUserId}/items_visits?date_from=${dateFrom}&date_to=${dateTo}`;
  const resUser = await fetch(urlUser, { headers: { Authorization: `Bearer ${accessToken}` } });
  const bodyUser = await resUser.json();
  diagnostics.test_user_level = {
    url: urlUser,
    httpStatus: resUser.status,
    body: bodyUser,
  };

  return NextResponse.json(diagnostics);
}
