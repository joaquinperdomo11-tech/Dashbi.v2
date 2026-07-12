import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, mlTokens, ordenes } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { refreshMLToken } from "@/lib/ml";

async function procesarEnvio(shipmentId: string, token: string) {
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
    return null;
  }
}

// Processes a batch of orders missing shipment details. Call repeatedly until done=true.
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

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

  // Get up to 20 orders still pending shipment enrichment
  const pending = await db.select().from(ordenes)
    .where(and(eq(ordenes.tenantId, tenant.id), eq(ordenes.tipoEnvio, "PENDIENTE"), isNotNull(ordenes.shipmentId)))
    .limit(20);

  if (pending.length === 0) {
    // Mark orders with no shipment as SIN ENVÍO
    const noShipment = await db.select().from(ordenes)
      .where(and(eq(ordenes.tenantId, tenant.id), eq(ordenes.tipoEnvio, "PENDIENTE")))
      .limit(50);
    for (const o of noShipment) {
      await db.update(ordenes).set({ tipoEnvio: "SIN ENVÍO" }).where(eq(ordenes.id, o.id));
    }
    return NextResponse.json({ ok: true, done: true, processed: 0 });
  }

  let processed = 0;
  for (const orden of pending) {
    if (!orden.shipmentId) continue;
    const envio = await procesarEnvio(orden.shipmentId, accessToken);
    if (envio) {
      await db.update(ordenes).set({
        tipoEnvio: envio.tipoEnvio,
        shippingCostSeller: String(envio.shippingCost),
        bonificacionEnvio: String(envio.bonificacion),
        estadoEnvio: envio.estadoEnvio,
      }).where(eq(ordenes.id, orden.id));
      processed++;
    } else {
      await db.update(ordenes).set({ tipoEnvio: "SIN ENVÍO" }).where(eq(ordenes.id, orden.id));
    }
  }

  // Check if there's more pending
  const remaining = await db.select().from(ordenes)
    .where(and(eq(ordenes.tenantId, tenant.id), eq(ordenes.tipoEnvio, "PENDIENTE")))
    .limit(1);

  return NextResponse.json({ ok: true, done: remaining.length === 0, processed });
}
