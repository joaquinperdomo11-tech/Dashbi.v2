import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, ordenes, mlTokens } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  // Try cache first
  const cached = await db.select().from(ordenes)
    .where(eq(ordenes.tenantId, tenant.id))
    .orderBy(desc(ordenes.fecha))
    .limit(200);

  if (cached.length > 0) {
    return NextResponse.json({ orders: cached, source: "cache" });
  }

  // Fallback: fetch live from ML
  if (!tenant.mlUserId) return NextResponse.json({ orders: [], source: "empty" });

  const [tokenRow] = await db.select().from(mlTokens).where(eq(mlTokens.tenantId, tenant.id));
  if (!tokenRow) return NextResponse.json({ orders: [], source: "no_token" });

  let accessToken = tokenRow.accessToken;
  if (new Date(tokenRow.expiresAt) < new Date()) {
    const refreshed = await refreshMLToken(tokenRow.refreshToken);
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

  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 30);
  const desde = hace30.toISOString().split(".")[0] + ".000-00:00";

  try {
    const res = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${tenant.mlUserId}&limit=50&sort=date_desc&order.date_created.from=${desde}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    const orders = (data.results || [])
      .filter((o: any) => o.status !== "cancelled")
      .map((o: any) => {
        const item = o.order_items?.[0];
        return {
          orderId: String(o.id),
          fecha: o.date_created,
          producto: item?.item?.title || "",
          sku: item?.item?.seller_sku || "",
          cantidad: item?.quantity || 1,
          totalItem: o.total_amount || 0,
          comisionMl: (item?.sale_fee || 0) * (item?.quantity || 1),
          estado: o.status,
          buyer: o.buyer?.nickname || "",
        };
      });
    return NextResponse.json({ orders, source: "ml_live" });
  } catch {
    return NextResponse.json({ error: "ML API error" }, { status: 500 });
  }
}
