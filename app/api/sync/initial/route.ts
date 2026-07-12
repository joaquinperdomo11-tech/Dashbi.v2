import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, ordenes } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant?.mlUserId) return NextResponse.json({ error: "No ML connected" }, { status: 400 });

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

  const hace90 = new Date();
  hace90.setDate(hace90.getDate() - 90);
  const desde = hace90.toISOString().split(".")[0] + ".000-00:00";

  let offset = 0, total = 999, synced = 0;
  const shipmentIds: string[] = [];

  while (offset < total && offset < 1000) { // safety cap
    const res = await fetch(
      `https://api.mercadolibre.com/orders/search?seller=${tenant.mlUserId}&limit=50&offset=${offset}&sort=date_desc&order.date_created.from=${desde}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!data.results?.length) break;
    total = data.paging?.total || data.results.length;

    for (const order of data.results) {
      if (order.status === "cancelled") continue;
      for (const item of order.order_items || []) {
        const shipmentId = order.shipping?.id ? String(order.shipping.id) : null;
        if (shipmentId) shipmentIds.push(shipmentId);

        try {
          await db.insert(ordenes).values({
            tenantId: tenant.id,
            orderId: String(order.id),
            fecha: new Date(order.date_created),
            producto: item.item?.title || "",
            sku: item.item?.seller_sku || "",
            itemIdMl: item.item?.id || "",
            cantidad: item.quantity || 1,
            precioUnitario: String(item.unit_price || 0),
            totalItem: String((item.unit_price || 0) * (item.quantity || 1)),
            comisionMl: String((item.sale_fee || 0) * (item.quantity || 1)),
            shippingCostSeller: "0",
            bonificacionEnvio: "0",
            tipoEnvio: "PENDIENTE",
            shipmentId,
            estado: order.status,
            estadoEnvio: "",
            buyer: order.buyer?.nickname || "",
          }).onConflictDoNothing({ target: [ordenes.tenantId, ordenes.orderId] });
          synced++;
        } catch (e) {
          console.error("Insert error:", e);
        }
      }
    }

    offset += 50;
  }

  // Update tenant to mark initial sync done
  await db.update(tenants).set({ initialSyncDone: true, updatedAt: new Date() }).where(eq(tenants.id, tenant.id));

  return NextResponse.json({ ok: true, synced, total, pendingShipments: shipmentIds.length });
}
