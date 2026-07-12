import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, costos } from "@/lib/db/schema";
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

  const rows = await db.select().from(costos).where(eq(costos.tenantId, tenant.id));
  return NextResponse.json({ costos: rows });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { sku, costoSinIva } = await req.json();
  if (!sku || costoSinIva === undefined) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await db.insert(costos).values({
    tenantId: tenant.id,
    sku,
    costoSinIva: String(costoSinIva),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [costos.tenantId, costos.sku],
    set: { costoSinIva: String(costoSinIva), updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { sku } = await req.json();
  if (!sku) return NextResponse.json({ error: "Missing sku" }, { status: 400 });

  await db.delete(costos).where(and(eq(costos.tenantId, tenant.id), eq(costos.sku, sku)));
  return NextResponse.json({ ok: true });
}
