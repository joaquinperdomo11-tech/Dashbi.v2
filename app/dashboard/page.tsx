"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface Order {
  orderId: string; fecha: string; producto: string; sku: string;
  cantidad: number; totalItem: number; estado: string;
}

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("es-UY"); }

function getDayKey(fecha: string) {
  return new Date(fecha).toLocaleDateString("es-UY", { timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [tenant, setTenant]   = useState<any>(null);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }

    const load = async () => {
      const res = await fetch("/api/tenant");
      const { tenant: t } = await res.json();
      setTenant(t);
      setLoading(false);

      if (t.mlUserId) {
        setLoadingOrders(true);
        const oRes = await fetch("/api/data/orders");
        const data = await oRes.json();
        setOrders(data.orders || []);
        setLoadingOrders(false);

        // Check if shipment enrichment is still pending
        const statusRes = await fetch("/api/sync/status");
        const status = await statusRes.json();
        if (status.pending > 0) {
          setEnriching(true);
          continueEnrichment();
        }
      }
    };
    load();
  }, [isLoaded, isSignedIn, router]);

  const continueEnrichment = async (attempt = 0) => {
    if (attempt > 100) { setEnriching(false); return; } // safety cap ~80s
    try {
      const res = await fetch("/api/sync/enrich-shipments", { method: "POST" });
      const data = await res.json();
      if (!data.done) {
        setTimeout(() => continueEnrichment(attempt + 1), 800);
      } else {
        setEnriching(false);
        // Refresh orders to show updated shipment data
        const oRes = await fetch("/api/data/orders");
        const oData = await oRes.json();
        setOrders(oData.orders || []);
      }
    } catch {
      setEnriching(false);
    }
  };

  const ventasPorDia = useMemo(() => {
    const map: Record<string, { fecha: string; ingresos: number; ordenes: number }> = {};
    orders.forEach(o => {
      const key = getDayKey(o.fecha);
      if (!map[key]) map[key] = { fecha: key, ingresos: 0, ordenes: 0 };
      map[key].ingresos += Number(o.totalItem);
      map[key].ordenes  += 1;
    });
    return Object.values(map).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [orders]);

  const totalIngresos = orders.reduce((s, o) => s + Number(o.totalItem), 0);
  const totalOrdenes  = orders.length;
  const totalUnidades = orders.reduce((s, o) => s + o.cantidad, 0);
  const ticketProm    = totalOrdenes > 0 ? totalIngresos / totalOrdenes : 0;
  const maxIngresos   = Math.max(...ventasPorDia.map(d => d.ingresos), 1);
  const daysLeft = tenant ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000)) : 0;

  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)"}}>
      <div style={{background:"var(--card)",borderBottom:"1px solid var(--border)",padding:"16px 32px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,background:"var(--accent)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>📦</div>
          <div>
            <p style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:"var(--text)",lineHeight:1}}>Dashbi</p>
            <p style={{fontSize:11,color:"var(--sub)",marginTop:2}}>{tenant?.nombre}</p>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {daysLeft > 0 && tenant?.status === "trial" && (
            <span style={{background:"var(--accent-bg)",color:"var(--accent)",fontSize:12,padding:"4px 12px",borderRadius:100,fontWeight:500}}>
              ⏳ {daysLeft} días de prueba
            </span>
          )}
          <UserButton />
        </div>
      </div>

      <div style={{padding:32,maxWidth:1100,margin:"0 auto",display:"flex",flexDirection:"column",gap:24}}>
        {!tenant?.mlUserId ? (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:48,textAlign:"center"}}>
            <div style={{fontSize:48,marginBottom:16}}>🔗</div>
            <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:24,color:"var(--text)",marginBottom:8}}>Conectá tu MercadoLibre</h2>
            <button onClick={() => router.push("/onboarding")}
              style={{background:"var(--accent)",color:"#fff",padding:"12px 24px",borderRadius:12,fontSize:14,fontWeight:500,border:"none",cursor:"pointer",marginTop:16}}>
              Conectar →
            </button>
          </div>
        ) : (
          <>
            {enriching && (
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"var(--accent-bg)",borderRadius:12,border:"1px solid var(--accent)"}}>
                <div style={{width:16,height:16,border:"2px solid var(--accent)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}} />
                <p style={{color:"var(--accent)",fontSize:13,fontWeight:500}}>
                  Seguimos completando el detalle de tus envíos — los datos se irán actualizando automáticamente.
                </p>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16}}>
              {[
                {label:"Ingresos", val: loadingOrders ? "..." : fmt(totalIngresos), icon:"💰", accent:true},
                {label:"Órdenes",  val: loadingOrders ? "..." : String(totalOrdenes),  icon:"🛒"},
                {label:"Unidades", val: loadingOrders ? "..." : String(totalUnidades), icon:"📦"},
                {label:"Ticket promedio", val: loadingOrders ? "..." : fmt(ticketProm), icon:"🎯"},
              ].map(card => (
                <div key={card.label} style={{background:"var(--card)",border:`1px solid ${card.accent?"var(--accent)":"var(--border)"}`,borderRadius:16,padding:20,boxShadow:"var(--shadow)"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                    <p style={{fontSize:11,color:"var(--sub)",textTransform:"uppercase",letterSpacing:"0.06em",fontWeight:500}}>{card.label}</p>
                    <span style={{fontSize:20}}>{card.icon}</span>
                  </div>
                  <p style={{fontSize:28,fontWeight:700,color: card.accent?"var(--accent)":"var(--text)"}}>{card.val}</p>
                </div>
              ))}
            </div>

            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:24,boxShadow:"var(--shadow)"}}>
              <h3 style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:"var(--text)",marginBottom:20}}>Ingresos por día — últimos 30 días</h3>
              {loadingOrders ? (
                <div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)"}}>Cargando datos...</div>
              ) : ventasPorDia.length === 0 ? (
                <div style={{height:160,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)"}}>Sin ventas recientes</div>
              ) : (
                <div style={{display:"flex",alignItems:"flex-end",gap:4,height:160}}>
                  {ventasPorDia.map((d, i) => {
                    const h = Math.max(4, (d.ingresos / maxIngresos) * 130);
                    return <div key={i} title={`${d.fecha}: ${fmt(d.ingresos)}`} style={{flex:1,background:"var(--accent)",borderRadius:"4px 4px 0 0",height:h,opacity:0.85}} />;
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
