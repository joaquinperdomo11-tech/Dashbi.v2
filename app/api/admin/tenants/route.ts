import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, ordenes, mlTokens } from "@/lib/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";

const ADMIN_EMAIL = "joaquin.perdomo11@gmai.com";

async function isAdmin() {
  const { userId } = await auth();
  if (!userId) return false;
  const user = await currentUser();
  return user?.emailAddresses.some(e => e.emailAddress === ADMIN_EMAIL) || false;
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const allTenants = await db.select().from(tenants).orderBy(tenants.createdAt);

  const hace90 = new Date();
  hace90.setDate(hace90.getDate() - 90);

  const results = await Promise.all(allTenants.map(async (t) => {
    // Total orders + revenue in last 90 days for average calc
    const orderStats = await db
      .select({
        count: sql<number>`count(*)::int`,
        totalRevenue: sql<number>`coalesce(sum(${ordenes.totalItem}), 0)::numeric`,
      })
      .from(ordenes)
      .where(and(eq(ordenes.tenantId, t.id), gte(ordenes.fecha, hace90), sql`${ordenes.estado} != 'cancelled'`));

    const stat = orderStats[0];
    const monthsSpan = 3; // 90 days ≈ 3 months
    const avgOrdersPerMonth = stat ? Math.round((stat.count || 0) / monthsSpan) : 0;
    const avgRevenuePerMonth = stat ? Math.round((Number(stat.totalRevenue) || 0) / monthsSpan) : 0;

    const [token] = await db.select({ updatedAt: mlTokens.updatedAt }).from(mlTokens).where(eq(mlTokens.tenantId, t.id));

    return {
      id: t.id,
      nombre: t.nombre,
      email: t.email,
      mlUserId: t.mlUserId,
      status: t.status,
      plan: t.plan,
      trialEndsAt: t.trialEndsAt,
      subscriptionEndsAt: t.subscriptionEndsAt,
      createdAt: t.createdAt,
      lastSync: token?.updatedAt || null,
      avgOrdersPerMonth,
      avgRevenuePerMonth,
    };
  }));

  const PLAN_PRICES: Record<string, number> = { basico: 19, pro: 39, agencia: 89 };
  const mrr = results
    .filter(t => t.status === "active")
    .reduce((s, t) => s + (PLAN_PRICES[t.plan || "pro"] || 0), 0);

  return NextResponse.json({
    tenants: results,
    summary: {
      total: results.length,
      active: results.filter(t => t.status === "active").length,
      trial: results.filter(t => t.status === "trial").length,
      inactive: results.filter(t => t.status === "inactive").length,
      mrr,
    },
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, status, plan } = await req.json();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const update: any = { updatedAt: new Date() };
  if (status) {
    update.status = status;
    if (status === "active") {
      update.subscriptionEndsAt = new Date(Date.now() + 30 * 86400000);
    }
  }
  if (plan) update.plan = plan;

  await db.update(tenants).set(update).where(eq(tenants.id, id));
  return NextResponse.json({ ok: true });
}
