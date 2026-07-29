import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, combos, comboComponentes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

async function getTenant(userId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  return tenant;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const rawCombos = await db.select().from(combos).where(eq(combos.tenantId, tenant.id));
  const rawComponentes = await db.select({
    id: comboComponentes.id,
    comboId: comboComponentes.comboId,
    componentSku: comboComponentes.componentSku,
    cantidad: comboComponentes.cantidad,
  }).from(comboComponentes)
    .innerJoin(combos, eq(comboComponentes.comboId, combos.id))
    .where(eq(combos.tenantId, tenant.id));

  const result = rawCombos.map(c => ({
    id: c.id,
    comboSku: c.comboSku,
    nombre: c.nombre,
    componentes: rawComponentes
      .filter(cc => cc.comboId === c.id)
      .map(cc => ({ id: cc.id, componentSku: cc.componentSku, cantidad: cc.cantidad })),
  }));

  return NextResponse.json({ combos: result });
}

// Crea o edita (upsert por comboSku) la receta completa de un combo.
// body: { comboSku: string, nombre?: string, componentes: [{ componentSku, cantidad }] }
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const body = await req.json().catch(() => null);
  const comboSku = body?.comboSku?.trim();
  const nombre = body?.nombre?.trim() || null;
  const componentesInput: { componentSku: string; cantidad: number }[] = body?.componentes || [];

  if (!comboSku) {
    return NextResponse.json({ error: "comboSku requerido" }, { status: 400 });
  }
  const componentesValidos = componentesInput
    .filter(c => c?.componentSku && String(c.componentSku).trim())
    .map(c => ({
      componentSku: String(c.componentSku).trim(),
      cantidad: Math.max(1, Math.round(Number(c.cantidad) || 1)),
    }))
    .filter(c => c.componentSku !== comboSku); // un combo no puede ser componente de sí mismo

  if (componentesValidos.length === 0) {
    return NextResponse.json({ error: "Se necesita al menos un componente válido" }, { status: 400 });
  }

  const [combo] = await db.insert(combos).values({
    tenantId: tenant.id,
    comboSku,
    nombre,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [combos.tenantId, combos.comboSku],
    set: { nombre, updatedAt: new Date() },
  }).returning();

  // Reemplaza la receta completa (simple para crear y para editar)
  await db.delete(comboComponentes).where(eq(comboComponentes.comboId, combo.id));
  await db.insert(comboComponentes).values(
    componentesValidos.map(c => ({ comboId: combo.id, componentSku: c.componentSku, cantidad: c.cantidad }))
  );

  return NextResponse.json({ ok: true, comboId: combo.id });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await db.delete(combos).where(and(eq(combos.id, id), eq(combos.tenantId, tenant.id)));
  return NextResponse.json({ ok: true });
}
