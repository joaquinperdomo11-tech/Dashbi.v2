import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

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

  const res = await fetch(`https://api.mercadolibre.com/users/${tenant.mlUserId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();

  return NextResponse.json({ seller_reputation: data.seller_reputation, nickname: data.nickname });
}
