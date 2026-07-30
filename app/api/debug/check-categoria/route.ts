import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, publicaciones } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

// ENDPOINT TEMPORAL DE DIAGNÓSTICO — borrar una vez resuelto el bug de categoría.
// Uso: entrar logueado a /api/debug/check-categoria (usa la primera publicación
// que encuentre) o /api/debug/check-categoria?itemId=MLU123456789 para una puntual.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ error: "No hay token de ML para este tenant" }, { status: 400 });

  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) {
      return NextResponse.json({ error: "No se pudo refrescar el token de ML" }, { status: 400 });
    }
    accessToken = refreshed.access_token;
  }

  const { searchParams } = new URL(req.url);
  let itemId = searchParams.get("itemId");

  if (!itemId) {
    const [anyPub] = await db.select().from(publicaciones).where(eq(publicaciones.tenantId, tenant.id)).limit(1);
    if (!anyPub) return NextResponse.json({ error: "No hay publicaciones guardadas para este tenant" }, { status: 400 });
    itemId = anyPub.itemId;
  }

  // 1. Pedimos el item directo a ML, igual que hace el cron
  const itemRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const itemStatus = itemRes.status;
  const item = await itemRes.json().catch(() => null);

  const categoryId = item?.category_id || null;

  // 2. Si vino category_id, probamos resolver el nombre
  let categoryName: string | null = null;
  let categoryFetchStatus: number | null = null;
  let categoryFetchError: string | null = null;
  if (categoryId) {
    try {
      const catRes = await fetch(`https://api.mercadolibre.com/categories/${categoryId}`);
      categoryFetchStatus = catRes.status;
      const catData = await catRes.json();
      categoryName = catData?.name || null;
    } catch (e: any) {
      categoryFetchError = String(e?.message || e);
    }
  }

  // 3. Qué hay guardado ahora mismo en la DB para este item (para comparar)
  const [dbRow] = await db.select().from(publicaciones)
    .where(eq(publicaciones.itemId, itemId))
    .limit(1);

  return NextResponse.json({
    itemIdConsultado: itemId,
    mlItemsFetchStatus: itemStatus,
    mlDevolvioCategoryId: categoryId,
    categoryNameResuelto: categoryName,
    categoryFetchStatus,
    categoryFetchError,
    // algunos campos crudos del item por si category_id viniera en otro lado
    itemKeysRelevantes: item ? {
      category_id: item.category_id,
      status: item.status,
      title: item.title,
    } : null,
    loQueHayGuardadoEnLaDB: dbRow ? {
      sku: dbRow.sku,
      categoryId: dbRow.categoryId,
      categoryName: dbRow.categoryName,
      availableQuantity: dbRow.availableQuantity,
    } : "No encontrado en DB",
  });
}
