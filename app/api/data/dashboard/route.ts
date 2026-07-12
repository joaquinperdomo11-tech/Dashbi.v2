import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchDashboardData } from "@/lib/sheets";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  try {
    const data = await fetchDashboardData(tenant.id);
    return NextResponse.json(data);
  } catch (e) {
    console.error("Dashboard data error:", e);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
