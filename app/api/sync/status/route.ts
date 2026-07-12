import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, ordenes } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const [{ count: total }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(ordenes).where(eq(ordenes.tenantId, tenant.id));

  const [{ count: pending }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(ordenes).where(and(eq(ordenes.tenantId, tenant.id), eq(ordenes.tipoEnvio, "PENDIENTE")));

  return NextResponse.json({ total, pending, enriched: total - pending });
}
