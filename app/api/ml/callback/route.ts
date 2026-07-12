import { NextRequest, NextResponse } from "next/server";
import { exchangeMLCode, getMLUser } from "@/lib/ml";
import { db } from "@/lib/db";
import { tenants, mlTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const code     = req.nextUrl.searchParams.get("code");
  const tenantId = req.nextUrl.searchParams.get("state");
  const appUrl   = process.env.NEXT_PUBLIC_APP_URL!;

  if (!code || !tenantId) return NextResponse.redirect(`${appUrl}/onboarding?error=missing_params`);

  try {
    const tokens = await exchangeMLCode(code);
    if (!tokens.access_token) return NextResponse.redirect(`${appUrl}/onboarding?error=token_failed`);

    const mlUser = await getMLUser(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await db.insert(mlTokens).values({
      tenantId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    }).onConflictDoUpdate({
      target: mlTokens.tenantId,
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        updatedAt: new Date(),
      },
    });

    await db.update(tenants).set({
      mlUserId: String(mlUser.id),
      mlSiteId: mlUser.site_id || "MLU",
      updatedAt: new Date(),
    }).where(eq(tenants.id, tenantId));

    return NextResponse.redirect(`${appUrl}/dashboard?connected=true`);
  } catch (e) {
    console.error(e);
    return NextResponse.redirect(`${appUrl}/onboarding?error=unknown`);
  }
}
