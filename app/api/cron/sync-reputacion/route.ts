import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, reputacion } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function getAccessToken(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) return null;
    accessToken = refreshed.access_token;
    await db.update(mlTokens).set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(mlTokens.tenantId, tenant.id));
  }
  return accessToken;
}

// One lightweight call per tenant per invocation — /users/{id} is fast.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));
  const eligible = activeTenants.filter(t => t.mlUserId);

  const results = [];
  for (const tenant of eligible) {
    const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
    if (!token) continue;
    const accessToken = await getAccessToken(tenant, token);
    if (!accessToken) continue;

    try {
      const res = await fetch(`https://api.mercadolibre.com/users/${tenant.mlUserId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      const rep = data.seller_reputation || {};
      const metrics = rep.metrics || {};

      await db.insert(reputacion).values({
        tenantId: tenant.id,
        storeName: data.nickname || "",
        levelId: rep.level_id || "",
        claimsRate: String(metrics.claims?.rate || 0),
        claimsLimit: String(metrics.claims?.value_limit || 0),
        cancellationsRate: String(metrics.cancellations?.rate || 0),
        cancellationsLimit: String(metrics.cancellations?.value_limit || 0),
        delayedRate: String(metrics.delayed_handling_time?.rate || 0),
        delayedLimit: String(metrics.delayed_handling_time?.value_limit || 0),
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: reputacion.tenantId,
        set: {
          storeName: data.nickname || "",
          levelId: rep.level_id || "",
          claimsRate: String(metrics.claims?.rate || 0),
          claimsLimit: String(metrics.claims?.value_limit || 0),
          cancellationsRate: String(metrics.cancellations?.rate || 0),
          cancellationsLimit: String(metrics.cancellations?.value_limit || 0),
          delayedRate: String(metrics.delayed_handling_time?.rate || 0),
          delayedLimit: String(metrics.delayed_handling_time?.value_limit || 0),
          updatedAt: new Date(),
        },
      });
      results.push({ tenantId: tenant.id, ok: true });
    } catch (e) {
      console.error("Reputacion sync error:", e);
      results.push({ tenantId: tenant.id, ok: false });
    }
  }

  return NextResponse.json({ ok: true, results });
}
