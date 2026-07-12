"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface CostoRow {
  sku: string;
  costoSinIva: string;
  updatedAt: string;
}

function fmt(n: number) {
  return "$" + Math.round(n).toLocaleString("es-UY");
}

export default function CostosPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [costos, setCostos]   = useState<CostoRow[]>([]);
  const [search, setSearch]   = useState("");

  const [sku, setSku]     = useState("");
  const [costo, setCosto] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }
    load();
  }, [isLoaded, isSignedIn, router]);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/data/costos");
    const data = await res.json();
    setCostos(data.costos || []);
    setLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku || !costo) return;
    setSaving(true);
    await fetch("/api/data/costos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: sku.trim(), costoSinIva: parseFloat(costo) }),
    });
    setSku("");
    setCosto("");
    setSaving(false);
    load();
  };

  const handleEdit = async (row: CostoRow, newValue: string) => {
    const val = parseFloat(newValue);
    if (isNaN(val)) return;
    await fetch("/api/data/costos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: row.sku, costoSinIva: val }),
    });
    load();
  };

  const handleDelete = async (sku: string) => {
    if (!confirm(`¿Eliminar costo de ${sku}?`)) return;
    await fetch("/api/data/costos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku }),
    });
    load();
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return costos.filter(c => !q || c.sku.toLowerCase().includes(q))
      .sort((a, b) => a.sku.localeCompare(b.sku));
  }, [costos, search]);

  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",padding:"24px"}}>
      <div style={{maxWidth:800,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"var(--text)"}}>Costos de mercadería</h1>
          <p style={{color:"var(--sub)",fontSize:13,marginTop:4}}>{costos.length} SKUs con costo cargado</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:20,display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end"}}>
          <div style={{flex:1,minWidth:140}}>
            <label style={{fontSize:11,color:"var(--sub)",display:"block",marginBottom:6}}>SKU</label>
            <input value={sku} onChange={e => setSku(e.target.value)} placeholder="Ej: IDOS001"
              style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:14,fontFamily:"'DM Mono',monospace"}} />
          </div>
          <div style={{width:140}}>
            <label style={{fontSize:11,color:"var(--sub)",display:"block",marginBottom:6}}>Costo sin IVA</label>
            <input value={costo} onChange={e => setCosto(e.target.value)} type="number" step="0.01" placeholder="0.00"
              style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:14,fontFamily:"'DM Mono',monospace"}} />
          </div>
          <button type="submit" disabled={saving || !sku || !costo}
            style={{background:"var(--accent)",color:"#fff",border:"none",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:600,cursor:"pointer",opacity:saving?0.6:1}}>
            {saving ? "Guardando..." : "+ Agregar"}
          </button>
        </form>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por SKU..."
          style={{padding:"10px 14px",borderRadius:12,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:14}} />

        {/* Table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
          {filtered.length === 0 ? (
            <p style={{textAlign:"center",padding:40,color:"var(--sub)",fontSize:14}}>
              {costos.length === 0 ? "Todavía no cargaste ningún costo" : "Sin resultados"}
            </p>
          ) : (
            <table style={{width:"100%",borderCollapse:"collapse"}}>
              <thead>
                <tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
                  {["SKU","Costo sin IVA","Actualizado",""].map(h => (
                    <th key={h} style={{padding:"10px 16px",textAlign:"left",fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.sku} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"10px 16px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"var(--text)"}}>{row.sku}</td>
                    <td style={{padding:"10px 16px"}}>
                      <input defaultValue={row.costoSinIva} type="number" step="0.01"
                        onBlur={e => e.target.value !== row.costoSinIva && handleEdit(row, e.target.value)}
                        style={{width:100,padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13,fontFamily:"'DM Mono',monospace"}} />
                    </td>
                    <td style={{padding:"10px 16px",fontSize:12,color:"var(--sub)"}}>
                      {row.updatedAt ? new Date(row.updatedAt).toLocaleDateString("es-UY") : "—"}
                    </td>
                    <td style={{padding:"10px 16px"}}>
                      <button onClick={() => handleDelete(row.sku)}
                        style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer",fontSize:13}}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
