import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, preguntas } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

async function getTenant(userId: string) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  return tenant;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tenant = await getTenant(userId);
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "UNANSWERED";

  const rows = await db.select().from(preguntas)
    .where(and(eq(preguntas.tenantId, tenant.id), eq(preguntas.status, status)))
    .orderBy(desc(preguntas.dateCreated))
    .limit(100);

  return NextResponse.json({ preguntas: rows });
}
