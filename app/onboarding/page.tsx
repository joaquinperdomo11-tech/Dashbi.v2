"use client";
import { useEffect, useState, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const LOADING_MESSAGES = [
  "Conectando con MercadoLibre...",
  "Trayendo tus últimas ventas...",
  "Procesando tus órdenes...",
  "Organizando tus productos más vendidos...",
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
  const [msgIndex, setMsgIndex]     = useState(0);
  const startTime = useRef<number>(0);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }

    const load = async () => {
      const res = await fetch("/api/tenant");
      const { tenant: t } = await res.json();

      if (t.mlUserId && !t.initialSyncDone) {
        // Connected but sync hasn't run yet
        setTenant(t);
        setSyncing(true);
        startTime.current = Date.now();
        runInitialSync();
        return;
      }
      if (t.mlUserId && t.initialSyncDone) {
        // Already fully set up — go straight to dashboard
        router.push("/dashboard");
        return;
      }
      setTenant(t);
      setLoading(false);
    };
    load();
  }, [isLoaded, isSignedIn, router]);

  // Rotate loading messages
  useEffect(() => {
    if (!syncing) return;
    const interval = setInterval(() => {
      setMsgIndex(i => Math.min(i + 1, LOADING_MESSAGES.length - 1));
    }, 2200);
    return () => clearInterval(interval);
  }, [syncing]);

  const runInitialSync = async () => {
    try {
      const res = await fetch("/api/sync/initial", { method: "POST" });
      const data = await res.json();
      setSyncedCount(data.synced || 0);
      // Kick off background enrichment (fire and forget, don't await fully)
      fetch("/api/sync/enrich-shipments", { method: "POST" }).catch(() => {});
    } catch (e) {
      console.error(e);
    }
    // Small delay so the last message is visible
    setTimeout(() => router.push("/dashboard"), 800);
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
    return (
      <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
        <div style={{maxWidth:440,width:"100%",textAlign:"center"}}>
          <div style={{position:"relative",width:72,height:72,margin:"0 auto 32px"}}>
            <div style={{position:"absolute",inset:0,border:"4px solid var(--border)",borderRadius:"50%"}} />
            <div style={{position:"absolute",inset:0,border:"4px solid transparent",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 1s linear infinite"}} />
            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26}}>📦</div>
          </div>
          <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"var(--text)",marginBottom:12,transition:"opacity 0.3s"}}>
            {LOADING_MESSAGES[msgIndex]}
          </h2>
          <p style={{color:"var(--sub)",fontSize:14,lineHeight:1.6}}>
            Estamos trayendo tus últimos 90 días de ventas.<br/>
            Esto puede tardar unos segundos, no cierres esta ventana.
          </p>
          {syncedCount > 0 && (
            <p style={{color:"var(--accent)",fontSize:13,fontWeight:600,marginTop:16}}>
              {syncedCount} órdenes encontradas hasta ahora
            </p>
          )}
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
            Al conectar, vamos a traer tus últimos <strong>90 días de ventas</strong>. Puede tardar un minuto.
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
