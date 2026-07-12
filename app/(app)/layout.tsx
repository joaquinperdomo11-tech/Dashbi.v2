"use client";
import { useEffect, useState } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { useRouter, usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Resumen", icon: "📊", section: "Menú principal" },
  { href: "/ordenes",   label: "Órdenes", icon: "📋", section: "Menú principal" },
  { href: "/productos", label: "Productos", icon: "📦", section: "Finanzas" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }
    const load = async () => {
      const res = await fetch("/api/tenant");
      const { tenant: t } = await res.json();
      setTenant(t);
      setLoading(false);
    };
    load();
  }, [isLoaded, isSignedIn, router]);

  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  let lastSection = "";

  return (
    <div style={{display:"flex", minHeight:"100vh", width:"100%", background:"var(--bg)"}}>
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col flex-shrink-0 border-r"
        style={{width:220, borderColor:"var(--border)", background:"var(--card)", minHeight:"100vh", position:"sticky", top:0, height:"100vh"}}>
        <div style={{padding:"20px 20px", borderBottom:"1px solid var(--border)"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:36,height:36,background:"var(--accent)",borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>📦</div>
            <div>
              <h1 style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,fontSize:16,color:"var(--text)",lineHeight:1}}>Dashbi</h1>
              <p style={{fontSize:10,color:"var(--sub)",marginTop:3,fontFamily:"'DM Mono',monospace"}}>{tenant?.nombre}</p>
            </div>
          </div>
        </div>

        <nav style={{flex:1, padding:"16px 12px"}}>
          {NAV_ITEMS.map(item => {
            const showSection = item.section !== lastSection;
            lastSection = item.section;
            const isActive = pathname === item.href;
            return (
              <div key={item.href}>
                {showSection && (
                  <p style={{fontSize:9,fontFamily:"'DM Mono',monospace",textTransform:"uppercase",letterSpacing:"0.1em",padding:"12px 12px 8px",color:"var(--muted)"}}>{item.section}</p>
                )}
                <button onClick={() => router.push(item.href)}
                  style={{
                    width:"100%",display:"flex",alignItems:"center",gap:12,padding:"10px 12px",borderRadius:12,fontSize:14,
                    background: isActive ? "var(--text)" : "transparent",
                    color: isActive ? "var(--bg2)" : "var(--sub)",
                    border:"none",cursor:"pointer",fontWeight: isActive ? 600 : 400, marginBottom:4,
                  }}>
                  <span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              </div>
            );
          })}
        </nav>

        <div style={{padding:"16px", borderTop:"1px solid var(--border)"}}>
          <UserButton />
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden" style={{position:"fixed",top:0,left:0,right:0,zIndex:50,background:"var(--card)",borderBottom:"1px solid var(--border)",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:30,height:30,background:"var(--accent)",borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15}}>📦</div>
          <p style={{fontFamily:"'DM Serif Display',serif",fontWeight:700,fontSize:15,color:"var(--text)"}}>Dashbi</p>
        </div>
        <UserButton />
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:50,background:"var(--card)",borderTop:"1px solid var(--border)",display:"flex",padding:"8px 0"}}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,background:"none",border:"none",cursor:"pointer",padding:"4px 0"}}>
              <span style={{fontSize:18}}>{item.icon}</span>
              <span style={{fontSize:10,color: isActive ? "var(--accent)" : "var(--sub)",fontWeight: isActive ? 600 : 400}}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main content */}
      <main style={{flex:1, minWidth:0, paddingTop:"64px", paddingBottom:"64px"}} className="md:pt-0 md:pb-0">
        {children}
      </main>
    </div>
  );
}
