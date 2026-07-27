import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { tenants, visitasDiarias, ordenes } from "@/lib/db/schema";
import { eq, gte, and } from "drizzle-orm";

// Bucketea una fecha en formato YYYY-MM-DD, en el huso horario de Uruguay,
// para que coincida con el formato guardado en visitasDiarias.fecha.
function dayKeyUY(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const day = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

function daysInMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkUserId, userId));
  if (!tenant) return NextResponse.json({ error: "No tenant" }, { status: 400 });

  const now = new Date();
  const curYear = now.getFullYear(), curMonth = now.getMonth();
  const prevDate = new Date(curYear, curMonth - 1, 1);
  const prevYear = prevDate.getFullYear(), prevMonth = prevDate.getMonth();

  const rangeStart = new Date(prevYear, prevMonth, 1);

  const [visitasRows, ordenesRows] = await Promise.all([
    db.select().from(visitasDiarias)
      .where(and(eq(visitasDiarias.tenantId, tenant.id), gte(visitasDiarias.fecha, dayKeyUY(rangeStart)))),
    db.select().from(ordenes)
      .where(and(eq(ordenes.tenantId, tenant.id), gte(ordenes.fecha, rangeStart))),
  ]);

  const visitasByDay: Record<string, number> = {};
  visitasRows.forEach(v => { visitasByDay[v.fecha] = v.totalVisitas || 0; });

  const ordenesByDay: Record<string, number> = {};
  ordenesRows.forEach(o => {
    if (!o.fecha || o.estado === "cancelled") return;
    const key = dayKeyUY(new Date(o.fecha));
    ordenesByDay[key] = (ordenesByDay[key] || 0) + 1;
  });

  function buildMonth(year: number, monthIndex0: number) {
    const total = daysInMonth(year, monthIndex0);
    const days = [];
    for (let d = 1; d <= total; d++) {
      const date = new Date(year, monthIndex0, d);
      if (date > now) break; // no completar días futuros del mes actual
      const key = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const visitas = visitasByDay[key] || 0;
      const ordenesCount = ordenesByDay[key] || 0;
      const conversion = visitas > 0 ? (ordenesCount / visitas) * 100 : 0;
      days.push({ fecha: key, dia: d, visitas, ordenes: ordenesCount, conversion: Number(conversion.toFixed(2)) });
    }
    return days;
  }

  return NextResponse.json({
    current: { monthKey: `${curYear}-${String(curMonth + 1).padStart(2, "0")}`, days: buildMonth(curYear, curMonth) },
    previous: { monthKey: `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`, days: buildMonth(prevYear, prevMonth) },
  });
}
