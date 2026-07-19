import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, syncCursors } from "@/lib/db/schema";
import { eq, or, and } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

const SYNC_TYPE = "publicaciones";

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

// Fetches ONE more page (100 ids) of a tenant's item list and appends it to the cursor.
// Call this repeatedly (e.g. every 1 min) to progressively build the full id list
// without ever doing a long-running loop in a single request.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));
  const eligible = activeTenants.filter(t => t.mlUserId);
  if (eligible.length === 0) return NextResponse.json({ ok: true, message: "No tenants" });

  const cursors = await db.select().from(syncCursors).where(eq(syncCursors.syncType, SYNC_TYPE));
  const cursorByTenant = new Map(cursors.map(c => [c.tenantId, c]));

  // Find a tenant whose list isn't marked complete, or hasn't been refreshed in 24h
  const DAY_MS = 24 * 60 * 60 * 1000;
  const incomplete = eligible.filter(t => {
    const c = cursorByTenant.get(t.id);
    if (!c || !c.lastFullSync) return true;
    return Date.now() - c.lastFullSync.getTime() > DAY_MS;
  });
  if (incomplete.length === 0) {
    return NextResponse.json({ ok: true, message: "All tenants up to date" });
  }

  const tenant = incomplete[0];
  const cursor = cursorByTenant.get(tenant.id);
  // If this tenant's list was previously complete but is now stale, start a fresh scan
  const startingFresh = cursor?.lastFullSync && (Date.now() - cursor.lastFullSync.getTime() > DAY_MS);
  const currentIds: string[] = startingFresh ? [] : (cursor?.itemIds ? JSON.parse(cursor.itemIds) : []);

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ ok: true, message: "No token" });

  const accessToken = await getAccessToken(tenant, token);
  if (!accessToken) return NextResponse.json({ ok: false, error: "refresh_failed" });

  const res = await fetch(
    `https://api.mercadolibre.com/users/${tenant.mlUserId}/items/search?limit=100&offset=${currentIds.length}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  const newIds = data.results || [];
  const total = data.paging?.total || 0;

  const merged = Array.from(new Set([...currentIds, ...newIds]));
  const isComplete = merged.length >= total || newIds.length === 0;

  await db.insert(syncCursors).values({
    tenantId: tenant.id,
    syncType: SYNC_TYPE,
    itemIds: JSON.stringify(merged),
    cursorPosition: cursor?.cursorPosition || 0,
    lastFullSync: isComplete ? new Date() : null,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [syncCursors.tenantId, syncCursors.syncType],
    set: { itemIds: JSON.stringify(merged), lastFullSync: isComplete ? new Date() : null, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, tenantId: tenant.id, totalIdsSoFar: merged.length, total, isComplete });
}
