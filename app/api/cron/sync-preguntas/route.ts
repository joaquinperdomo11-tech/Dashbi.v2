import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, preguntas, publicaciones } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function syncTenantPreguntas(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
  let accessToken = token.accessToken;

  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (!refreshed.access_token) return { tenantId: tenant.id, error: "refresh_failed" };
    accessToken = refreshed.access_token;
    await db.update(mlTokens).set({
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
      updatedAt: new Date(),
    }).where(eq(mlTokens.tenantId, tenant.id));
  }

  const pubsList = await db.select({ itemId: publicaciones.itemId, sku: publicaciones.sku })
    .from(publicaciones).where(eq(publicaciones.tenantId, tenant.id));
  const skuByItem: Record<string, string> = {};
  pubsList.forEach(p => { if (p.itemId) skuByItem[p.itemId] = p.sku || ""; });

  let synced = 0;

  // Unanswered questions
  const resU = await fetch(
    `https://api.mercadolibre.com/questions/search?seller_id=${tenant.mlUserId}&status=UNANSWERED&limit=50&sort_fields=date_created&sort_types=DESC`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const dataU = await resU.json();

  for (const q of dataU.questions || []) {
    try {
      await db.insert(preguntas).values({
        tenantId: tenant.id,
        questionId: String(q.id),
        itemId: q.item_id,
        itemTitle: q.item?.title || "",
        itemThumbnail: q.item?.thumbnail || "",
        sku: skuByItem[q.item_id] || "",
        fromNickname: q.from?.nickname || "",
        text: q.text || "",
        answerText: null,
        status: "UNANSWERED",
        dateCreated: q.date_created ? new Date(q.date_created) : null,
        dateAnswered: null,
      }).onConflictDoUpdate({
        target: [preguntas.tenantId, preguntas.questionId],
        set: { status: "UNANSWERED", text: q.text || "" },
      });
      synced++;
    } catch (e) { console.error("Insert pregunta error:", e); }
  }

  // Recently answered (last 50, to build history)
  const resA = await fetch(
    `https://api.mercadolibre.com/questions/search?seller_id=${tenant.mlUserId}&status=ANSWERED&limit=50&sort_fields=date_created&sort_types=DESC`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const dataA = await resA.json();

  for (const q of dataA.questions || []) {
    try {
      await db.insert(preguntas).values({
        tenantId: tenant.id,
        questionId: String(q.id),
        itemId: q.item_id,
        itemTitle: q.item?.title || "",
        itemThumbnail: q.item?.thumbnail || "",
        sku: skuByItem[q.item_id] || "",
        fromNickname: q.from?.nickname || "",
        text: q.text || "",
        answerText: q.answer?.text || "",
        status: "ANSWERED",
        dateCreated: q.date_created ? new Date(q.date_created) : null,
        dateAnswered: q.answer?.date_created ? new Date(q.answer.date_created) : null,
      }).onConflictDoUpdate({
        target: [preguntas.tenantId, preguntas.questionId],
        set: { status: "ANSWERED", answerText: q.answer?.text || "", dateAnswered: q.answer?.date_created ? new Date(q.answer.date_created) : null },
      });
      synced++;
    } catch (e) { console.error("Insert pregunta error:", e); }
  }

  return { tenantId: tenant.id, synced };
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeTenants = await db.select().from(tenants)
    .where(or(eq(tenants.status, "trial"), eq(tenants.status, "active")));

  const results = [];
  for (const tenant of activeTenants) {
    if (!tenant.mlUserId) continue;
    const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
    if (!token) continue;
    const result = await syncTenantPreguntas(tenant, token);
    results.push(result);
  }

  return NextResponse.json({ ok: true, synced: results });
}
