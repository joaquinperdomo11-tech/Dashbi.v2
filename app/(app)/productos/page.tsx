"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface ComboComponente {
  sku: string;
  cantidad: number;
  stockDisponible: number;
}

interface Producto {
  itemId: string;
  sku: string;
  title: string;
  thumbnail: string;
  price: number;
  availableQuantity: number;
  status: string;
  categoryId: string;
  categoryName: string;
  ventasHistoricas: number;
  costoSinIva: string;
  isCombo: boolean;
  componentes: ComboComponente[];
  stockCombo: number | null;
  promoActiva: boolean;
  promoTipo: string;
  promoPrecio: number | null;
  promoHasta: string | null;
}

interface Cards {
  cantidadActivos: number;
  cantidadTotal: number;
  cantidadCombos: number;
  cantidadIndividuales: number;
  costoStock: number;
  precioPromedio: number;
}

interface ComboRecipe {
  id: number;
  comboSku: string;
  nombre: string | null;
  componentes: { id: number; componentSku: string; cantidad: number }[];
}

const ESTADO_LABELS: Record<string, string> = {
  active: "Activa", paused: "Pausada", closed: "Cerrada", under_review: "En revisión",
};
const ESTADO_COLORS: Record<string, string> = {
  active: "var(--green)", paused: "#CA8A04", closed: "var(--red)", under_review: "var(--sub)",
};

function fmt(n: number) { return "$" + Math.round(n).toLocaleString("es-UY"); }

function fmtFecha(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-UY", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 16, padding: 16 }}>
      <p style={{ fontSize: 12, color: "var(--sub)", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", fontFamily: "'DM Mono',monospace" }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

export default function ProductosPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cards, setCards]       = useState<Cards | null>(null);
  const [search, setSearch]     = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [filterTipo, setFilterTipo] = useState<"all" | "individual" | "combo">("all");
  const [savingSku, setSavingSku] = useState<string | null>(null);

  // Gestión de combos
  const [combosList, setCombosList] = useState<ComboRecipe[]>([]);
  const [showComboForm, setShowComboForm] = useState(false);
  const [comboSkuForm, setComboSkuForm] = useState("");
  const [comboNombreForm, setComboNombreForm] = useState("");
  const [comboComponentesForm, setComboComponentesForm] = useState<{ componentSku: string; cantidad: number }[]>([
    { componentSku: "", cantidad: 1 },
  ]);
  const [savingCombo, setSavingCombo] = useState(false);
  const [comboError, setComboError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }
    load();
  }, [isLoaded, isSignedIn, router]);

  const load = async () => {
    setLoading(true);
    const [res, combosRes] = await Promise.all([
      fetch("/api/data/productos"),
      fetch("/api/data/combos"),
    ]);
    const data = await res.json();
    setProductos(data.productos || []);
    setCards(data.cards || null);
    if (combosRes.ok) {
      const combosData = await combosRes.json();
      setCombosList(combosData.combos || []);
    }
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
      const matchTipo = filterTipo === "all" || (filterTipo === "combo" ? p.isCombo : !p.isCombo);
      return matchSearch && matchEstado && matchTipo;
    });
  }, [productos, search, filterEstado, filterTipo]);

  const conCosto = productos.filter(p => p.costoSinIva).length;

  // ── Gestión de combos ──
  const skusDisponibles = useMemo(
    () => productos.map(p => p.sku).filter(Boolean).sort(),
    [productos]
  );

  const resetComboForm = () => {
    setComboSkuForm("");
    setComboNombreForm("");
    setComboComponentesForm([{ componentSku: "", cantidad: 1 }]);
    setComboError("");
  };

  const editCombo = (combo: ComboRecipe) => {
    setComboSkuForm(combo.comboSku);
    setComboNombreForm(combo.nombre || "");
    setComboComponentesForm(
      combo.componentes.length > 0
        ? combo.componentes.map(c => ({ componentSku: c.componentSku, cantidad: c.cantidad }))
        : [{ componentSku: "", cantidad: 1 }]
    );
    setComboError("");
    setShowComboForm(true);
  };

  const addComponenteRow = () => {
    setComboComponentesForm(prev => [...prev, { componentSku: "", cantidad: 1 }]);
  };

  const removeComponenteRow = (idx: number) => {
    setComboComponentesForm(prev => prev.filter((_, i) => i !== idx));
  };

  const updateComponenteRow = (idx: number, field: "componentSku" | "cantidad", value: string) => {
    setComboComponentesForm(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      return field === "cantidad" ? { ...c, cantidad: Math.max(1, parseInt(value) || 1) } : { ...c, componentSku: value };
    }));
  };

  const saveCombo = async () => {
    setComboError("");
    if (!comboSkuForm) { setComboError("Elegí el SKU que representa el combo"); return; }
    const componentesValidos = comboComponentesForm.filter(c => c.componentSku);
    if (componentesValidos.length === 0) { setComboError("Agregá al menos un componente"); return; }
    setSavingCombo(true);
    const res = await fetch("/api/data/combos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comboSku: comboSkuForm,
        nombre: comboNombreForm,
        componentes: componentesValidos,
      }),
    });
    setSavingCombo(false);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setComboError(err.error || "No se pudo guardar el combo");
      return;
    }
    resetComboForm();
    setShowComboForm(false);
    load();
  };

  const deleteCombo = async (id: number) => {
    await fetch(`/api/data/combos?id=${id}`, { method: "DELETE" });
    load();
  };

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

        {/* Cards de resumen */}
        {cards && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))",gap:12}}>
            <StatCard label="Tipo" value={`${cards.cantidadIndividuales} / ${cards.cantidadCombos}`} sub="Individuales / Combos" />
            <StatCard label="Artículos activos" value={String(cards.cantidadActivos)} />
            <StatCard label="Cantidad de artículos" value={String(cards.cantidadTotal)} />
            <StatCard label="Costo del stock" value={fmt(cards.costoStock)} sub="Sobre stock cargado con costo" />
            <StatCard label="Precio venta promedio" value={fmt(cards.precioPromedio)} sub="Publicaciones activas" />
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
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as any)}
            style={{padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13}}>
            <option value="all">Individuales y combos</option>
            <option value="individual">Solo individuales</option>
            <option value="combo">Solo combos</option>
          </select>
        </div>

        {/* Table */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,overflow:"hidden"}}>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",minWidth:1000}}>
              <thead>
                <tr style={{background:"var(--bg)",borderBottom:"1px solid var(--border)"}}>
                  {["","Producto / SKU","Categoría","Precio","Stock","Vendidas","Promoción","Estado","Costo sin IVA"].map(h => (
                    <th key={h} style={{padding:"10px 14px",textAlign:"left",fontSize:10,color:"var(--sub)",fontFamily:"'DM Mono',monospace",textTransform:"uppercase",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{textAlign:"center",padding:40,color:"var(--sub)"}}>Sin resultados</td></tr>
                ) : filtered.map(p => (
                  <tr key={p.itemId} style={{borderBottom:"1px solid var(--border)"}}>
                    <td style={{padding:"8px 14px"}}>
                      {p.thumbnail ? (
                        <img src={p.thumbnail} alt="" style={{width:36,height:36,borderRadius:8,objectFit:"cover"}} />
                      ) : (
                        <div style={{width:36,height:36,borderRadius:8,background:"var(--bg)"}} />
                      )}
                    </td>
                    <td style={{padding:"8px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <p style={{fontSize:13,color:"var(--text)"}}>{p.title}</p>
                        {p.isCombo && (
                          <span style={{fontSize:10,padding:"2px 6px",borderRadius:100,background:"var(--accent-bg)",color:"var(--accent)",fontFamily:"'DM Mono',monospace"}}>COMBO</span>
                        )}
                      </div>
                      <p style={{fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>{p.sku || "—"}</p>
                      {p.isCombo && p.componentes.length > 0 && (
                        <p style={{fontSize:10,color:"var(--muted)",marginTop:2}}>
                          {p.componentes.map(c => `${c.cantidad}× ${c.sku}`).join(" + ")}
                        </p>
                      )}
                    </td>
                    <td style={{padding:"8px 14px",fontSize:12,color:"var(--sub)"}}>{p.categoryName || "—"}</td>
                    <td style={{padding:"8px 14px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"var(--text)"}}>{fmt(p.price)}</td>
                    <td style={{padding:"8px 14px",fontSize:13,fontFamily:"'DM Mono',monospace"}}>
                      {p.isCombo ? (
                        <span title="Calculado en base al stock actual de los componentes">
                          {p.stockCombo ?? 0} <span style={{fontSize:10,color:"var(--muted)"}}>(calc.)</span>
                        </span>
                      ) : p.availableQuantity}
                    </td>
                    <td style={{padding:"8px 14px",fontSize:13,fontFamily:"'DM Mono',monospace",color:"var(--sub)"}}>{p.ventasHistoricas}</td>
                    <td style={{padding:"8px 14px",fontSize:12}}>
                      {p.promoActiva ? (
                        <div>
                          <span style={{padding:"2px 6px",borderRadius:100,background:"var(--green-bg, rgba(34,197,94,0.15))",color:"var(--green)",fontSize:10,fontFamily:"'DM Mono',monospace"}}>
                            {p.promoTipo || "PROMO"}
                          </span>
                          {p.promoPrecio != null && (
                            <p style={{fontSize:11,color:"var(--text)",marginTop:3,fontFamily:"'DM Mono',monospace"}}>{fmt(p.promoPrecio)}</p>
                          )}
                          {p.promoHasta && (
                            <p style={{fontSize:10,color:"var(--sub)",marginTop:1}}>hasta {fmtFecha(p.promoHasta)}</p>
                          )}
                        </div>
                      ) : (
                        <span style={{color:"var(--sub)"}}>—</span>
                      )}
                    </td>
                    <td style={{padding:"8px 14px"}}>
                      <span style={{fontSize:12,color: ESTADO_COLORS[p.status] || "var(--sub)"}}>{ESTADO_LABELS[p.status] || p.status}</span>
                    </td>
                    <td style={{padding:"8px 14px"}}>
                      <input
                        defaultValue={p.costoSinIva}
                        placeholder="—"
                        onBlur={e => handleCostoChange(p.sku, e.target.value)}
                        disabled={savingSku === p.sku}
                        style={{width:90,padding:"6px 8px",borderRadius:8,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:12,fontFamily:"'DM Mono',monospace"}}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Gestión de combos */}
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:16,display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <h2 style={{fontFamily:"'DM Serif Display',serif",fontSize:18,color:"var(--text)"}}>Combos</h2>
              <p style={{fontSize:12,color:"var(--sub)",marginTop:2}}>
                Definí qué SKUs propios componen un combo. El stock disponible se calcula solo, en base al stock actual de cada componente — todavía no se descuenta stock automáticamente al vender.
              </p>
            </div>
            <button
              onClick={() => { resetComboForm(); setShowComboForm(v => !v); }}
              style={{padding:"9px 14px",borderRadius:10,border:"1px solid var(--accent)",background: showComboForm ? "transparent" : "var(--accent)",color: showComboForm ? "var(--accent)" : "#0C0C10",fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}>
              {showComboForm ? "Cancelar" : "+ Nuevo combo"}
            </button>
          </div>

          {showComboForm && (
            <div style={{background:"var(--bg)",border:"1px solid var(--border)",borderRadius:12,padding:16,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:"1 1 220px"}}>
                  <label style={{fontSize:11,color:"var(--sub)",display:"block",marginBottom:4}}>SKU del combo (publicación en ML)</label>
                  <select value={comboSkuForm} onChange={e => setComboSkuForm(e.target.value)}
                    style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}}>
                    <option value="">Elegí un SKU...</option>
                    {skusDisponibles.map(sku => <option key={sku} value={sku}>{sku}</option>)}
                  </select>
                </div>
                <div style={{flex:"1 1 220px"}}>
                  <label style={{fontSize:11,color:"var(--sub)",display:"block",marginBottom:4}}>Nombre descriptivo (opcional)</label>
                  <input value={comboNombreForm} onChange={e => setComboNombreForm(e.target.value)} placeholder="Ej: Mesa + 2 sillas"
                    style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}} />
                </div>
              </div>

              <div>
                <label style={{fontSize:11,color:"var(--sub)",display:"block",marginBottom:6}}>Componentes (SKUs propios que se descuentan)</label>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {comboComponentesForm.map((c, idx) => (
                    <div key={idx} style={{display:"flex",gap:8,alignItems:"center"}}>
                      <select value={c.componentSku} onChange={e => updateComponenteRow(idx, "componentSku", e.target.value)}
                        style={{flex:1,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}}>
                        <option value="">Elegí un SKU...</option>
                        {skusDisponibles.filter(sku => sku !== comboSkuForm).map(sku => <option key={sku} value={sku}>{sku}</option>)}
                      </select>
                      <input type="number" min={1} value={c.cantidad} onChange={e => updateComponenteRow(idx, "cantidad", e.target.value)}
                        style={{width:70,padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:13}} />
                      <button onClick={() => removeComponenteRow(idx)} disabled={comboComponentesForm.length === 1}
                        style={{padding:"8px 10px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:13,cursor:"pointer"}}>✕</button>
                    </div>
                  ))}
                </div>
                <button onClick={addComponenteRow}
                  style={{marginTop:8,padding:"7px 12px",borderRadius:10,border:"1px dashed var(--border)",background:"transparent",color:"var(--sub)",fontSize:12,cursor:"pointer"}}>
                  + Agregar componente
                </button>
              </div>

              {comboError && <p style={{fontSize:12,color:"var(--red)"}}>{comboError}</p>}

              <div>
                <button onClick={saveCombo} disabled={savingCombo}
                  style={{padding:"9px 16px",borderRadius:10,border:"none",background:"var(--accent)",color:"#0C0C10",fontSize:13,cursor:"pointer",fontWeight:600}}>
                  {savingCombo ? "Guardando..." : "Guardar combo"}
                </button>
              </div>
            </div>
          )}

          {combosList.length === 0 ? (
            <p style={{fontSize:13,color:"var(--sub)"}}>Todavía no armaste ningún combo.</p>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {combosList.map(combo => (
                <div key={combo.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px"}}>
                  <div>
                    <p style={{fontSize:13,color:"var(--text)"}}>
                      {combo.nombre || combo.comboSku} <span style={{fontSize:11,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>({combo.comboSku})</span>
                    </p>
                    <p style={{fontSize:11,color:"var(--muted)",marginTop:2}}>
                      {combo.componentes.map(c => `${c.cantidad}× ${c.componentSku}`).join(" + ")}
                    </p>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={() => editCombo(combo)}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:12,cursor:"pointer"}}>
                      Editar
                    </button>
                    <button onClick={() => deleteCombo(combo.id)}
                      style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",background:"transparent",color:"var(--red)",fontSize:12,cursor:"pointer"}}>
                      Borrar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
