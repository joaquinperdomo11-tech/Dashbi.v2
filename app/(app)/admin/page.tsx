"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const ADMIN_EMAIL = "joaquin.perdomo11@gmail.com";

interface TenantRow {
  id: string;
  nombre: string;
  email: string;
  mlUserId: string | null;
  status: string;
  plan: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  createdAt: string;
  lastSync: string | null;
  avgOrdersPerMonth: number;
  avgRevenuePerMonth: number;
}

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("es-UY"); }

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Nunca";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora mismo";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

const STATUS_LABELS: Record<string, string> = { active: "Activo", trial: "Trial", inactive: "Inactivo" };
const STATUS_COLORS: Record<string, string> = { active: "var(--green)", trial: "#CA8A04", inactive: "var(--red)" };

export default function AdminPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [tenants, setTenants]   = useState<TenantRow[]>([]);
  const [summary, setSummary]   = useState({ total: 0, active: 0, trial: 0, inactive: 0, mrr: 0 });
  const [search, setSearch]     = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selected, setSelected] = useState<TenantRow | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }
    const email = user?.emailAddresses[0]?.emailAddress;
    if (email !== ADMIN_EMAIL) { router.push("/dashboard"); return; }
    load();
  }, [isLoaded, isSignedIn, user, router]);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/tenants");
    if (!res.ok) { setLoading(false); return; }
    const data = await res.json();
    setTenants(data.tenants || []);
    setSummary(data.summary || summary);
    setLoading(false);
  };

  const updateTenant = async (id: string, patch: { status?: string; plan?: string }) => {
    setUpdating(id);
    await fetch("/api/admin/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await load();
    setUpdating(null);
    if (selected?.id === id) {
      const updated = tenants.find(t => t.id === id);
      if (updated) setSelected({ ...updated, ...patch } as TenantRow);
    }
  };

  const trialsAtRisk = useMemo(() => {
    return tenants.filter(t => {
      if (t.status !== "trial" || !t.trialEndsAt) return false;
      const daysLeft = Math.ceil((new Date(t.trialEndsAt).getTime() - Date.now()) / 86400000);
      return daysLeft <= 3 && daysLeft >= 0;
    });
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tenants.filter(t => {
      const matchSearch = !q || t.nombre?.toLowerCase().includes(q) || t.email?.toLowerCase().includes(q);
      const matchStatus = filterStatus === "all" || t.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [tenants, search, filterStatus]);

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{padding:"24px"}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"var(--text)"}}>Panel de administración</h1>
          <p style={{color:"var(--sub)",fontSize:13,marginTop:4}}>Gestión de clientes Dashbi</p>
        </div>

        {/* Summary cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
          {[
            { label: "Total clientes", val: summary.total, color: "var(--text)" },
            { label: "Activos", val: summary.active, color: "var(--green)" },
            { label: "En trial", val: summary.trial, color: "#CA8A04" },
            { label: "Inactivos", val: summary.inactive, color: "var(--red)" },
            { label: "MRR estimado", val: "$" + summary.mrr, color: "var(--accent)" },
          ].map(c => (
            <div key={c.label} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:16}}>
              <p style={{fontSize:12,color:"var(--sub)",marginBottom:6}}>{c.label}</p>
              <p style={{fontSize:26,fontWeight:700,color:c.color}}>{c.val}</p>
            </div>
          ))}
        </div>

        {trialsAtRisk.length > 0 && (
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"rgba(202,138,4,0.1)",border:"1px solid #CA8A04",borderRadius:12}}>
            <span style={{fontSize:16}}>⏱️</span>
            <p style={{fontSize:13,color:"#CA8A04"}}>
              {trialsAtRisk.length} cliente{trialsAtRisk.length > 1 ? "s" : ""} con trial venciendo en menos de 3 días
            </p>
          </div>
        )}

        {/* Filters */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o email..."
            style={{flex:1,minWidth:200,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}}>
            <option value="all">Todos los estados</option>
            <option value="active">Activos</option>
            <option value="trial">En trial</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        {/* Table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead>
                <tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
                  {["Cliente","Estado","Plan","Órdenes/mes","Última sync",""].map(h => (
                    <th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{textAlign:"center",padding:40,color:"var(--sub)"}}>Sin resultados</td></tr>
                ) : filtered.map(t => (
                  <tr key={t.id} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"12px 16px"}}>
                      <p style={{fontSize:14,fontWeight:500,color:"var(--text)"}}>{t.nombre || "Sin nombre"}</p>
                      <p style={{fontSize:12,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>{t.email}</p>
                    </td>
                    <td style={{padding:"12px 16px"}}>
                      <span style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:(STATUS_COLORS[t.status]||"var(--sub)")+"18",color:STATUS_COLORS[t.status]||"var(--sub)",fontWeight:500,whiteSpace:"nowrap"}}>
                        {STATUS_LABELS[t.status] || t.status}
                      </span>
                    </td>
                    <td style={{padding:"12px 16px",fontSize:13,color:"var(--text)",textTransform:"capitalize"}}>{t.plan || "—"}</td>
                    <td style={{padding:"12px 16px",fontSize:13,color:"var(--text)",fontFamily:"'DM Mono',monospace"}}>{t.avgOrdersPerMonth}</td>
                    <td style={{padding:"12px 16px",fontSize:12,color:"var(--sub)"}}>{timeAgo(t.lastSync)}</td>
                    <td style={{padding:"12px 16px"}}>
                      <button onClick={() => setSelected(t)}
                        style={{padding:"6px 14px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:12,cursor:"pointer"}}>
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div onClick={() => setSelected(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:100}}>
          <div onClick={e => e.stopPropagation()}
            style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:28,maxWidth:480,width:"100%",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20}}>
              <div>
                <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:22,color:"var(--text)"}}>{selected.nombre || "Sin nombre"}</h2>
                <p style={{fontSize:13,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{background:"none",border:"none",fontSize:20,color:"var(--sub)",cursor:"pointer"}}>×</button>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              <div style={{background:"var(--bg)",borderRadius:12,padding:14}}>
                <p style={{fontSize:11,color:"var(--sub)",marginBottom:4}}>Ventas prom./mes</p>
                <p style={{fontSize:18,fontWeight:700,color:"var(--accent)"}}>{fmt(selected.avgRevenuePerMonth)}</p>
              </div>
              <div style={{background:"var(--bg)",borderRadius:12,padding:14}}>
                <p style={{fontSize:11,color:"var(--sub)",marginBottom:4}}>Órdenes prom./mes</p>
                <p style={{fontSize:18,fontWeight:700,color:"var(--text)"}}>{selected.avgOrdersPerMonth}</p>
              </div>
              <div style={{background:"var(--bg)",borderRadius:12,padding:14}}>
                <p style={{fontSize:11,color:"var(--sub)",marginBottom:4}}>ML conectado</p>
                <p style={{fontSize:13,fontWeight:500,color: selected.mlUserId ? "var(--green)" : "var(--red)"}}>
                  {selected.mlUserId ? "✓ " + selected.mlUserId : "✗ No conectado"}
                </p>
              </div>
              <div style={{background:"var(--bg)",borderRadius:12,padding:14}}>
                <p style={{fontSize:11,color:"var(--sub)",marginBottom:4}}>Última sync</p>
                <p style={{fontSize:13,fontWeight:500,color:"var(--text)"}}>{timeAgo(selected.lastSync)}</p>
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{fontSize:12,color:"var(--sub)",display:"block",marginBottom:6}}>Estado</label>
              <div style={{display:"flex",gap:8}}>
                {["trial","active","inactive"].map(s => (
                  <button key={s} onClick={() => updateTenant(selected.id, { status: s })}
                    disabled={updating === selected.id}
                    style={{
                      flex:1,padding:"8px",borderRadius:8,fontSize:12,cursor:"pointer",fontWeight:500,
                      background: selected.status === s ? (STATUS_COLORS[s]) : "transparent",
                      color: selected.status === s ? "#fff" : "var(--sub)",
                      border: `1px solid ${selected.status === s ? STATUS_COLORS[s] : "var(--border)"}`,
                    }}>
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{fontSize:12,color:"var(--sub)",display:"block",marginBottom:6}}>Plan</label>
              <select value={selected.plan || "pro"} onChange={e => updateTenant(selected.id, { plan: e.target.value })}
                style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}}>
                <option value="basico">Básico — $19/mes</option>
                <option value="pro">Pro — $39/mes</option>
                <option value="agencia">Agencia — $89/mes</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
