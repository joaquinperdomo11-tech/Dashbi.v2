import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, preguntas } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const { questionId, text } = await req.json();
  if (!questionId || !text) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: "Texto demasiado largo" }, { status: 400 });

  const [token] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!token) return NextResponse.json({ error: "No token" }, { status: 400 });

  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(token.refreshToken);
    if (refreshed.access_token) {
      accessToken = refreshed.access_token;
      await db.update(mlTokens).set({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
        updatedAt: new Date(),
      }).where(eq(mlTokens.tenantId, tenant.id));
    }
  }

  const res = await fetch("https://api.mercadolibre.com/answers", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question_id: Number(questionId), text }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: "ML rechazó la respuesta", detail: err }, { status: 500 });
  }

  await db.update(preguntas).set({
    status: "ANSWERED",
    answerText: text,
    dateAnswered: new Date(),
  }).where(and(eq(preguntas.tenantId, tenant.id), eq(preguntas.questionId, String(questionId))));

  return NextResponse.json({ ok: true });
}
