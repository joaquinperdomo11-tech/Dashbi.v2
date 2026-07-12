"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import type { Order } from "@/lib/sheets";

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("es-UY"); }

const ESTADO_LABELS: Record<string, string> = {
  paid: "Pagado", confirmed: "Confirmado", cancelled: "Cancelado",
  shipped: "Enviado", delivered: "Entregado", ready_to_ship: "Listo para enviar",
  pending: "Pendiente", handling: "Preparando",
};

const ESTADO_COLORS: Record<string, string> = {
  paid: "var(--green)", confirmed: "var(--accent)", cancelled: "var(--red)",
  shipped: "var(--accent)", delivered: "var(--green)", ready_to_ship: "var(--accent)",
  pending: "var(--sub)", handling: "var(--sub)",
};

export default function OrdenesPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders]   = useState<Order[]>([]);
  const [costos, setCostos]   = useState<Record<string, number>>({});

  const [search, setSearch]         = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterEnvio, setFilterEnvio]   = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [page, setPage]             = useState(0);
  const PAGE_SIZE = 30;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }

    const load = async () => {
      const [oRes, cRes] = await Promise.all([
        fetch("/api/data/dashboard"),
        fetch("/api/data/costos"),
      ]);
      const oData = await oRes.json();
      const cData = await cRes.json();
      setOrders(oData.orders || []);
      const cMap: Record<string, number> = {};
      (cData.costos || []).forEach((c: any) => { cMap[c.sku] = Number(c.costoSinIva) || 0; });
      setCostos(cMap);
      setLoading(false);
    };
    load();
  }, [isLoaded, isSignedIn, router]);

  const IVA = 1.22;

  const estadosDisponibles = useMemo(() => Array.from(new Set(orders.map(o => o.estado))), [orders]);
  const enviosDisponibles  = useMemo(() => Array.from(new Set(orders.map(o => o.tipoEnvio))), [orders]);

  const filtered = useMemo(() => {
    return orders.filter(o => {
      const q = search.toLowerCase();
      const matchSearch = !q || o.producto.toLowerCase().includes(q) || o.sku.toLowerCase().includes(q) || o.orderId.includes(q);
      const matchEstado = filterEstado === "all" || o.estado === filterEstado;
      const matchEnvio  = filterEnvio === "all" || o.tipoEnvio === filterEnvio;
      const fecha = new Date(o.fecha);
      const matchFrom = !dateFrom || fecha >= new Date(dateFrom);
      const matchTo   = !dateTo || fecha <= new Date(dateTo + "T23:59:59");
      return matchSearch && matchEstado && matchEnvio && matchFrom && matchTo;
    }).sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
  }, [orders, search, filterEstado, filterEnvio, dateFrom, dateTo]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageOrders = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalRev  = filtered.reduce((s, o) => s + o.totalItem, 0);
  const totalRent = filtered.reduce((s, o) => {
    const costo = (costos[o.sku] || 0) * IVA * o.cantidad;
    return s + o.totalItem - o.comisionML - o.shippingCostSeller + o.bonificacionEnvio - costo;
  }, 0);
  const rentPct = totalRev > 0 ? (totalRent / totalRev * 100) : 0;

  if (loading) return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",padding:"24px"}}>
      <div style={{maxWidth:1200,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"var(--text)"}}>Órdenes</h1>
          <p style={{color:"var(--sub)",fontSize:13,marginTop:4}}>
            {filtered.length} órdenes · <span style={{color:"var(--green)"}}>{fmt(totalRev)}</span> · <span style={{color:"var(--green)"}}>{rentPct.toFixed(1)}% rent.</span>
          </p>
        </div>

        {/* Filters */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:16,display:"flex",gap:10,flexWrap:"wrap"}}>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar producto, SKU u orden..."
            style={{flex:1,minWidth:200,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}} />

          <select value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(0); }}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}}>
            <option value="all">Todos los estados</option>
            {estadosDisponibles.map(e => <option key={e} value={e}>{ESTADO_LABELS[e] || e}</option>)}
          </select>

          <select value={filterEnvio} onChange={e => { setFilterEnvio(e.target.value); setPage(0); }}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}}>
            <option value="all">Todos los envíos</option>
            {enviosDisponibles.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(0); }}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}} />
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(0); }}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}} />

          {(search || filterEstado !== "all" || filterEnvio !== "all" || dateFrom || dateTo) && (
            <button onClick={() => { setSearch(""); setFilterEstado("all"); setFilterEnvio("all"); setDateFrom(""); setDateTo(""); setPage(0); }}
              style={{padding:"9px 14px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:13,cursor:"pointer"}}>
              Limpiar
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
              <thead>
                <tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
                  {["Fecha","Producto / SKU","Cant.","Total","Rent. $","Rent. %","Envío","Estado"].map(h => (
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:"var(--sub)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageOrders.length === 0 ? (
                  <tr><td colSpan={8} style={{textAlign:"center",padding:40,color:"var(--sub)"}}>Sin resultados</td></tr>
                ) : pageOrders.map((o, i) => {
                  const costoMerc = (costos[o.sku] || 0) * IVA * o.cantidad;
                  const rentReal  = o.totalItem - o.comisionML - o.shippingCostSeller + o.bonificacionEnvio - costoMerc;
                  const rentPctRow = o.totalItem > 0 ? (rentReal / o.totalItem * 100) : 0;
                  const hasCosto  = !!costos[o.sku];
                  const rentColor = rentReal >= 0 ? "var(--green)" : "var(--red)";
                  return (
                    <tr key={`${o.orderId}-${i}`} style={{borderBottom:"1px solid var(--border)"}}>
                      <td style={{padding:"10px 14px",fontSize:12,color:"var(--sub)",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>
                        {new Date(o.fecha).toLocaleDateString("es-UY",{day:"2-digit",month:"short"})}
                      </td>
                      <td style={{padding:"10px 14px",maxWidth:220}}>
                        <p style={{fontSize:13,color:"var(--text)",fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{o.producto}</p>
                        <p style={{fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>{o.sku}</p>
                      </td>
                      <td style={{padding:"10px 14px",fontSize:13,color:"var(--text)",textAlign:"center"}}>{o.cantidad}</td>
                      <td style={{padding:"10px 14px",fontSize:13,color:"var(--text)",fontWeight:500,fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{fmt(o.totalItem)}</td>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color: hasCosto ? rentColor : "var(--sub)",whiteSpace:"nowrap"}}>
                        {hasCosto ? fmt(rentReal) : "—"}
                      </td>
                      <td style={{padding:"10px 14px",fontSize:13,fontWeight:700,fontFamily:"'DM Mono',monospace",color: hasCosto ? rentColor : "var(--sub)"}}>
                        {hasCosto ? `${rentPctRow.toFixed(1)}%` : "—"}
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:"var(--card2)",color:"var(--sub)",fontFamily:"'DM Mono',monospace",whiteSpace:"nowrap"}}>{o.tipoEnvio}</span>
                      </td>
                      <td style={{padding:"10px 14px"}}>
                        <span style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:(ESTADO_COLORS[o.estado]||"var(--sub)")+"18",color:ESTADO_COLORS[o.estado]||"var(--sub)",fontWeight:500,whiteSpace:"nowrap"}}>
                          {ESTADO_LABELS[o.estado] || o.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{padding:"12px 16px",borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <span style={{fontSize:12,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>
                {page * PAGE_SIZE + 1}–{Math.min((page+1)*PAGE_SIZE, filtered.length)} de {filtered.length}
              </span>
              <div style={{display:"flex",gap:4}}>
                <button onClick={() => setPage(p => Math.max(0, p-1))} disabled={page === 0}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:12,cursor:"pointer",opacity:page===0?0.4:1}}>←</button>
                <button onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page >= totalPages-1}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:12,cursor:"pointer",opacity:page>=totalPages-1?0.4:1}}>→</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
