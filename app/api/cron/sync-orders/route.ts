import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, ordenes } from "@/lib/db/schema";
import { eq, or } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function procesarEnvio(shipmentId: string | null, token: string) {
  if (!shipmentId) return { tipoEnvio: "SIN ENVÍO", shippingCost: 0, bonificacion: 0, estadoEnvio: "" };
  try {
    const sRes = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sd = await sRes.json();
    const logisticType = sd.logistic?.type || sd.logistic_type || "";
    let tipoEnvio = "SIN ENVÍO";
    if (logisticType === "fulfillment") tipoEnvio = "FULL";
    else if (logisticType === "flex" || logisticType === "self_service") tipoEnvio = "FLEX";
    else if (["drop_off", "cross_docking", "xd_drop_off"].includes(logisticType)) tipoEnvio = "MERCADO ENVIOS";
    else if (logisticType === "not_specified") tipoEnvio = "RETIRO";

    const cRes = await fetch(`https://api.mercadolibre.com/shipments/${shipmentId}/costs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const sc = await cRes.json();

    return {
      tipoEnvio,
      shippingCost: sc.senders?.[0]?.cost || 0,
      bonificacion: sc.senders?.[0]?.save || 0,
      estadoEnvio: sd.status || "",
    };
  } catch {
    return { tipoEnvio: "SIN ENVÍO", shippingCost: 0, bonificacion: 0, estadoEnvio: "" };
  }
}

async function syncTenant(tenant: typeof tenants.$inferSelect, token: typeof mlTokens.$inferSelect) {
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

  const hace7 = new Date();
  hace7.setDate(hace7.getDate() - 7);
  const desde = hace7.toISOString().split(".")[0] + ".000-00:00";

  const res = await fetch(
    `https://api.mercadolibre.com/orders/search?seller=${tenant.mlUserId}&limit=50&sort=date_desc&order.date_created.from=${desde}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();

  if (!data.results?.length) return { tenantId: tenant.id, synced: 0 };

  let synced = 0;
  for (const order of data.results) {
    if (order.status === "cancelled") continue;
    for (const item of order.order_items || []) {
      const shipmentId = order.shipping?.id ? String(order.shipping.id) : null;
      const envio = await procesarEnvio(shipmentId, accessToken);

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
          shippingCostSeller: String(envio.shippingCost),
          bonificacionEnvio: String(envio.bonificacion),
          tipoEnvio: envio.tipoEnvio,
          shipmentId,
          estado: order.status,
          estadoEnvio: envio.estadoEnvio,
          buyer: order.buyer?.nickname || "",
        }).onConflictDoNothing({ target: [ordenes.tenantId, ordenes.orderId] });
        synced++;
      } catch (e) {
        console.error("Insert error:", e);
      }
    }
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
    const result = await syncTenant(tenant, token);
    results.push(result);
  }

  return NextResponse.json({ ok: true, synced: results });
}
