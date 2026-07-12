"use client";
import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const LOADING_MESSAGES = [
  "Conectando con MercadoLibre...",
  "Trayendo tus ventas...",
  "Procesando tus órdenes...",
  "Organizando tus productos...",
  "Ya casi terminamos...",
];

export default function OnboardingPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [tenant, setTenant]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing]       = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [totalCount, setTotalCount]   = useState(0);
  const [msgIndex, setMsgIndex]     = useState(0);
  const startTime = useRef<number>(0);
  const cancelled = useRef(false);
  const syncStarted = useRef(false);

  useEffect(() => {
    console.log("[onboarding] effect fired", { isLoaded, isSignedIn });
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }

    const load = async () => {
      console.log("[onboarding] fetching tenant...");
      const res = await fetch("/api/tenant");
      const { tenant: t } = await res.json();
      console.log("[onboarding] tenant loaded", t);

      if (t.mlUserId && !t.initialSyncDone) {
        if (syncStarted.current) { console.log("[onboarding] sync already started, skipping"); return; }
        syncStarted.current = true;
        console.log("[onboarding] starting sync loop");
        setTenant(t);
        setSyncing(true);
        startTime.current = Date.now();
        runInitialSyncLoop();
        return;
      }
      if (t.mlUserId && t.initialSyncDone) {
        router.push("/dashboard");
        return;
      }
      setTenant(t);
      setLoading(false);
    };
    load();

    return () => { cancelled.current = true; };
  }, [isLoaded, isSignedIn, router]);

  // Rotate loading messages
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % LOADING_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [syncing]);

  const inFlight = useRef(false);

  const runInitialSyncLoop = async (offset = 0) => {
    if (cancelled.current) return;
    if (inFlight.current) return; // avoid overlapping calls
    inFlight.current = true;
    try {
      const res = await fetch("/api/sync/initial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offset }),
      });
      const data = await res.json();

      setSyncedCount(prev => prev + (data.synced || 0));
      setTotalCount(data.total || 0);

      inFlight.current = false;

      if (!data.done && data.nextOffset !== undefined) {
        runInitialSyncLoop(data.nextOffset);
      } else {
        fetch("/api/sync/enrich-shipments", { method: "POST" }).catch(() => {});
        setTimeout(() => router.push("/dashboard"), 600);
      }
    } catch (e) {
      console.error(e);
      inFlight.current = false;
      setTimeout(() => runInitialSyncLoop(offset), 2000);
    }
  };

  const connectML = async () => {
    if (!tenant?.id) return;
    setConnecting(true);
    const res = await fetch(`/api/ml/auth-url?tenant_id=${tenant.id}`);
    const { url } = await res.json();
    window.location.href = url;
  };

  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:24,height:24,border:"2px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (syncing) {
    const pct = totalCount > 0 ? Math.min(100, Math.round((syncedCount / totalCount) * 100)) : 0;
    const elapsed = (Date.now() - startTime.current) / 1000;
    const rate = syncedCount > 0 ? syncedCount / elapsed : 0;
    const remaining = rate > 0 && totalCount > syncedCount ? Math.ceil((totalCount - syncedCount) / rate) : null;

    return (
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{maxWidth:460,width:"100%",textAlign:"center"}}>
          <div style={{position:"relative",width:72,height:72,margin:"0 auto 28px"}}>
            <div style={{position:"absolute",inset:0,border:"4px solid var(--border)",borderRadius:"50%"}} />
            <div style={{position:"absolute",inset:0,border:"4px solid transparent",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 1s linear infinite"}} />
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>📦</div>
          </div>

          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"var(--text)",marginBottom:8,transition:"opacity 0.3s"}}>
            {LOADING_MESSAGES[msgIndex]}
          </h2>
          <p style={{color:"var(--sub)",fontSize:14,lineHeight:1.6,marginBottom:24}}>
            Estamos trayendo tus últimos 90 días de ventas.<br/>No cierres esta ventana.
          </p>

          {/* Progress bar */}
          <div style={{background:"var(--border)",borderRadius:100,height:8,overflow:"hidden",marginBottom:12}}>
            <div style={{background:"var(--accent)",height:"100%",width:`${pct}%`,transition:"width 0.4s ease",borderRadius:100}} />
          </div>

          <div style={{display:"flex",justifyContent:"space-between",fontSize:12.5,color:"var(--sub)"}}>
            <span>
              {totalCount > 0
                ? <><strong style={{color:"var(--accent)"}}>{syncedCount}</strong> de {totalCount} órdenes</>
                : syncedCount > 0
                  ? <><strong style={{color:"var(--accent)"}}>{syncedCount}</strong> órdenes encontradas</>
                  : "Contactando MercadoLibre..."}
            </span>
            {remaining !== null && remaining > 0 && (
              <span>~{remaining < 60 ? `${remaining}s` : `${Math.ceil(remaining/60)} min`} restantes</span>
            )}
          </div>

          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    );
  }

  const daysLeft = tenant?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - Date.now()) / 86400000))
    : 15;

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{maxWidth:520,width:"100%",background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:40,boxShadow:"var(--shadow-md)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:48,marginBottom:16}}>🔗</div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:28,color:"var(--text)",marginBottom:8}}>
            Conectá tu MercadoLibre
          </h1>
          <p style={{color:"var(--sub)",fontSize:15,lineHeight:1.6}}>
            Autorizá a Dashbi para acceder a tus ventas, publicaciones y métricas.
          </p>
        </div>

        <div style={{background:"var(--bg)",borderRadius:12,padding:20,marginBottom:20,display:"flex",flexDirection:"column",gap:12}}>
          {[
            ["📊","Ventas e ingresos","Órdenes, precios, comisiones"],
            ["🏪","Publicaciones","Stock, estado, métricas"],
            ["📦","Envíos","Estado y seguimiento"],
          ].map(([icon, title, desc]) => (
            <div key={title as string} style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:20}}>{icon}</span>
              <div>
                <p style={{fontSize:14,fontWeight:500,color:"var(--text)"}}>{title}</p>
                <p style={{fontSize:12,color:"var(--sub)"}}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:20,padding:"10px 14px",background:"var(--accent-bg)",borderRadius:10}}>
          <span style={{fontSize:16}}>⏱️</span>
          <p style={{color:"var(--accent)",fontSize:12.5,lineHeight:1.4}}>
            Al conectar, vamos a traer tus últimos <strong>90 días de ventas</strong>. Puede tardar un par de minutos.
          </p>
        </div>

        <button onClick={connectML} disabled={connecting || !tenant}
          style={{width:"100%",background:"var(--accent)",color:"#fff",padding:"14px",borderRadius:12,fontSize:15,fontWeight:600,border:"none",cursor:connecting?"wait":"pointer",opacity:connecting?0.7:1,marginBottom:16}}>
          {connecting ? "Redirigiendo a MercadoLibre..." : "Conectar mi MercadoLibre →"}
        </button>

        <p style={{textAlign:"center",color:"var(--muted)",fontSize:12}}>
          🔒 Conexión segura · Podés desconectar cuando quieras
        </p>

        {daysLeft > 0 && (
          <div style={{marginTop:20,padding:"10px 16px",background:"var(--accent-bg)",borderRadius:10,textAlign:"center"}}>
            <p style={{color:"var(--accent)",fontSize:13,fontWeight:500}}>
              🎉 Te quedan {daysLeft} días de prueba gratis
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
