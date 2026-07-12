"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface Producto {
  itemId: string;
  sku: string;
  title: string;
  thumbnail: string;
  price: number;
  availableQuantity: number;
  status: string;
  freeShipping: boolean;
  ventasHistoricas: number;
  costoSinIva: string;
}

const ESTADO_LABELS: Record<string, string> = {
  active: "Activa", paused: "Pausada", closed: "Cerrada", under_review: "En revisión",
};
const ESTADO_COLORS: Record<string, string> = {
  active: "var(--green)", paused: "#CA8A04", closed: "var(--red)", under_review: "var(--sub)",
};

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("es-UY"); }

export default function ProductosPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [search, setSearch]     = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [savingSku, setSavingSku] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }
    load();
  }, [isLoaded, isSignedIn, router]);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/data/productos");
    const data = await res.json();
    setProductos(data.productos || []);
    setLoading(false);
  };

  const handleCostoChange = async (sku: string, value: string) => {
    if (!sku) return;
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setSavingSku(sku);
    await fetch("/api/data/costos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, costoSinIva: num }),
    });
    setProductos(prev => prev.map(p => p.sku === sku ? { ...p, costoSinIva: String(num) } : p));
    setSavingSku(null);
  };

  const estadosDisponibles = useMemo(() => Array.from(new Set(productos.map(p => p.status))), [productos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return productos.filter(p => {
      const matchSearch = !q || p.title.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchEstado = filterEstado === "all" || p.status === filterEstado;
      return matchSearch && matchEstado;
    });
  }, [productos, search, filterEstado]);

  const conCosto = productos.filter(p => p.costoSinIva).length;

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{padding:"24px"}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"var(--text)"}}>Productos</h1>
          <p style={{color:"var(--sub)",fontSize:13,marginTop:4}}>
            {productos.length} publicaciones · <span style={{color: conCosto === productos.length ? "var(--green)" : "var(--accent)"}}>{conCosto} con costo cargado</span>
          </p>
        </div>

        {productos.length === 0 && (
          <div style={{background:"var(--accent-bg)",border:"1px solid var(--accent)",borderRadius:12,padding:16}}>
            <p style={{color:"var(--accent)",fontSize:13}}>
              Todavía no sincronizamos tus publicaciones. Esto se actualiza automáticamente — volvé a entrar en unos minutos.
            </p>
          </div>
        )}

        {/* Filters */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:16,display:"flex",gap:10,flexWrap:"wrap"}}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título o SKU..."
            style={{flex:1,minWidth:200,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}} />
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}}>
            <option value="all">Todos los estados</option>
            {estadosDisponibles.map(e => <option key={e} value={e}>{ESTADO_LABELS[e] || e}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead>
                <tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
                  {["","Producto / SKU","Precio","Stock","Vendidas","Envío gratis","Estado","Costo sin IVA"].map(h => (
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:"var(--sub)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} style={{textAlign:"center",padding:40,color:"var(--sub)"}}>Sin resultados</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.itemId} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"8px 14px"}}>
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" style={{width:36,height:36,borderRadius:8,objectFit:"cover"}} />
                      ) : (
                        <div style={{width:36,height:36,borderRadius:8,background:"var(--card2)"}} />
                      )}
                    </td>
                    <td style={{padding:"8px 14px",maxWidth:260}}>
                      <p style={{fontSize:13,color:"var(--text)",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.title}</p>
                      <p style={{fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>{p.sku || "sin SKU"}</p>
                    </td>
                    <td style={{padding:"8px 14px",fontSize:13,color:"var(--text)",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{fmt(p.price)}</td>
                    <td style={{padding:"8px 14px",fontSize:13,color:"var(--text)",fontFamily:"'DM Mono',monospace"}}>{p.availableQuantity}</td>
                    <td style={{padding:"8px 14px",fontSize:13,color:"var(--text)",fontFamily:"'DM Mono',monospace"}}>{p.ventasHistoricas}</td>
                    <td style={{padding:"8px 14px",textAlign:"center"}}>
                      <span style={{fontSize:14,color: p.freeShipping ? "var(--green)" : "var(--red)"}}>
                        {p.freeShipping ? "✓" : "✗"}
                      </span>
                    </td>
                    <td style={{padding:"8px 14px"}}>
                      <span style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:(ESTADO_COLORS[p.status]||"var(--sub)")+"18",color:ESTADO_COLORS[p.status]||"var(--sub)",fontWeight:500,whiteSpace:"nowrap"}}>
                        {ESTADO_LABELS[p.status] || p.status}
                      </span>
                    </td>
                    <td style={{padding:"8px 14px"}}>
                      <input
                        defaultValue={p.costoSinIva}
                        type="number"
                        step="0.01"
                        placeholder="—"
                        disabled={!p.sku}
                        onBlur={e => e.target.value && handleCostoChange(p.sku, e.target.value)}
                        style={{
                          width:100,padding:"6px 10px",borderRadius:8,
                          border: `1px solid ${p.costoSinIva ? "var(--green)" : "var(--border)"}`,
                          background: savingSku === p.sku ? "var(--accent-bg)" : "var(--bg)",
                          color:"var(--text)",fontSize:13,fontFamily:"'DM Mono',monospace",
                          opacity: p.sku ? 1 : 0.4,
                        }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
