import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));

  if (!tenant) {
    const user = await currentUser();
    const [newTenant] = await db.insert(tenants).values({
      clerkUserId: userId,
      email: user?.emailAddresses[0]?.emailAddress || "",
      nombre: user?.firstName || user?.emailAddresses[0]?.emailAddress?.split("@")[0] || "",
      status: "trial",
      trialEndsAt: new Date(Date.now() + 15 * 86400000),
    }).returning();
    tenant = newTenant;
  }

  return NextResponse.json({ tenant });
}
