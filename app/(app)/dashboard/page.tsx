"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/sheets";
import StatCard from "@/app/components/StatCard";
import RevenueChart from "@/app/components/RevenueChart";
import MonthlyChart from "@/app/components/MonthlyChart";
import WaterfallChart from "@/app/components/WaterfallChart";
import TodaySnapshot from "@/app/components/TodaySnapshot";
import TopProductosResumen from "@/app/components/TopProductosResumen";

function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  const [tenant, setTenant]       = useState<any>(null);
  const [data, setData]           = useState<DashboardData | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);
  const [dataLoading, setDataLoading]     = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Load tenant + kick off connect flow if needed
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }

    const load = async () => {
      const res = await fetch("/api/tenant");
      const { tenant: t } = await res.json();
      setTenant(t);
      setTenantLoading(false);
    };
    load();
  }, [isLoaded, isSignedIn, router]);

  const fetchDashboardData = useCallback(async () => {
    setDataLoading(true);
    try {
      const res = await fetch("/api/data/dashboard");
      if (!res.ok) throw new Error("fetch failed");
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Load dashboard data once ML is connected, then poll every 5 min
  useEffect(() => {
    if (!tenant?.mlUserId) return;
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [tenant?.mlUserId, fetchDashboardData]);

  // Poll shipment enrichment status while pending
  useEffect(() => {
    if (!tenant?.mlUserId) return;
    let cancelled = false;

    const checkStatus = async () => {
      const res = await fetch("/api/sync/status");
      const status = await res.json();
      if (cancelled) return;
      if (status.pending > 0) {
        setEnriching(true);
        continueEnrichment(0);
      }
    };

    const continueEnrichment = async (attempt: number) => {
      if (cancelled || attempt > 100) { setEnriching(false); return; }
      try {
        const res = await fetch("/api/sync/enrich-shipments", { method: "POST" });
        const d = await res.json();
        if (!d.done) {
          setTimeout(() => continueEnrichment(attempt + 1), 800);
        } else {
          setEnriching(false);
          fetchDashboardData();
        }
      } catch {
        setEnriching(false);
      }
    };

    checkStatus();
    return () => { cancelled = true; };
  }, [tenant?.mlUserId, fetchDashboardData]);

  const { currentMonth, prevMonth } = data || {};

  const valorStock = useMemo(() => {
    const publicaciones = data?.publicaciones || [];
    const costos = data?.costos || {};
    return publicaciones
      .filter(p => p.status === "active" || p.status === "paused")
      .reduce((sum, p) => {
        const costo = costos[p.sku || ""] || 0;
        return sum + costo * 1.22 * p.available_quantity;
      }, 0);
  }, [data?.publicaciones, data?.costos]);

  function pct(cur?: number, prev?: number) {
    if (!prev || prev === 0) return undefined;
    return (((cur || 0) - prev) / prev) * 100;
  }

  const daysLeft = tenant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 0;

  if (tenantLoading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{padding:"24px"}}>
        {!tenant?.mlUserId ? (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:48,textAlign:"center",maxWidth:600,margin:"40px auto"}}>
            <div style={{fontSize:48,marginBottom:16}}>🔗</div>
            <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:"var(--text)",marginBottom:8}}>Conectá tu MercadoLibre</h2>
            <button onClick={() => router.push("/onboarding")}
              style={{background:"var(--accent)",color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:500,border:"none",cursor:"pointer",marginTop:16}}>
              Conectar →
            </button>
          </div>
        ) : (
          <div style={{maxWidth:1200, margin:"0 auto", display:"flex", flexDirection:"column", gap:24}}>
            {daysLeft > 0 && tenant?.status === "trial" && (
              <div style={{display:"flex",justifyContent:"flex-end"}}>
                <span style={{background:"var(--accent-bg)",color:"var(--accent)",fontSize:12,padding:"5px 14px",borderRadius:100,fontWeight:500}}>
                  ⏳ {daysLeft} días de prueba
                </span>
              </div>
            )}

            {enriching && (
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"var(--accent-bg)",borderRadius:12,border:"1px solid var(--accent)"}}>
                <div style={{width:16,height:16,border:"2px solid var(--accent)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}} />
                <p style={{color:"var(--accent)",fontSize:13,fontWeight:500}}>
                  Seguimos completando el detalle de tus envíos — los datos se irán actualizando automáticamente.
                </p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}

            {/* Hoy */}
            {data && <TodaySnapshot orders={data.orders} costos={data.costos} />}
            {!data && dataLoading && <Skeleton className="h-40 rounded-2xl" />}

            <div style={{borderTop:"1px solid var(--border)"}} />

            {/* KPIs mes actual */}
            <section>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <p style={{fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Mes actual</p>
                <p style={{fontSize:11,color:"var(--muted)",fontFamily:"'DM Mono',monospace"}}>vs mismo período mes anterior</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 sm:gap-4">
                {dataLoading && !data ? Array.from({length:6}).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />) : (
                  <>
                    <StatCard label="Ingresos brutos" value={currentMonth?.revenue || 0} prefix="$" accent delay={0} icon="💰" trend={pct(currentMonth?.revenue, prevMonth?.revenue)} />
                    <StatCard label="Ticket promedio" value={currentMonth?.avgOrderValue || 0} prefix="$" delay={80} icon="🎯" trend={pct(currentMonth?.avgOrderValue, prevMonth?.avgOrderValue)} />
                    <StatCard label="Total órdenes" value={currentMonth?.orders || 0} delay={160} icon="🛒" trend={pct(currentMonth?.orders, prevMonth?.orders)} />
                    <StatCard label="Unidades vendidas" value={currentMonth?.units || 0} delay={240} icon="📦" trend={pct(currentMonth?.units, prevMonth?.units)} />
                    <StatCard label="Valor stock" value={valorStock} prefix="$" delay={320} icon="🏭" sub="a costo c/IVA" />
                    <StatCard
                      label="Rentabilidad"
                      value={(currentMonth?.rentabilidadPct ?? 0) !== 0 ? currentMonth?.rentabilidadPct || 0 : currentMonth?.margenPct || 0}
                      suffix="%"
                      decimals={1}
                      delay={400}
                      icon="📈"
                      accent
                      sub={`$${((currentMonth?.rentabilidadPct ?? 0) !== 0 ? currentMonth?.rentabilidadReal || 0 : currentMonth?.margen || 0).toLocaleString("es-UY", {maximumFractionDigits: 0})} · antes de impuestos`}
                      trend={pct(
                        (currentMonth?.rentabilidadPct ?? 0) !== 0 ? currentMonth?.rentabilidadPct : currentMonth?.margenPct,
                        (prevMonth?.rentabilidadPct ?? 0) !== 0 ? prevMonth?.rentabilidadPct : prevMonth?.margenPct
                      )}
                    />
                  </>
                )}
              </div>
            </section>

            {/* Gráfico diario */}
            <section>
              {dataLoading && !data ? <Skeleton className="h-80 rounded-2xl" /> : data && (
                <>
                  <RevenueChart byDay={data.revenueByDay} byMonth={data.revenueByMonth} currentMonthByDay={data.revenueCurrentMonth} prevMonthByDay={data.revenuePrevMonth} />
                  <div style={{marginTop:24}} />
                  <MonthlyChart revenueByMonth={data.revenueByMonth} />
                </>
              )}
            </section>

            {/* Waterfall + Top 10 */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {dataLoading && !data ? (
                <>
                  <Skeleton className="h-80 rounded-2xl" />
                  <Skeleton className="h-80 rounded-2xl" />
                </>
              ) : data && (
                <>
                  <WaterfallChart allOrders={data.orders} costos={data.costos} />
                  <TopProductosResumen orders={data.orders} costos={data.costos} />
                </>
              )}
            </section>
          </div>
        )}
    </div>
  );
}
