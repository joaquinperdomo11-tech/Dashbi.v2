"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";

function useCountUp(ref: React.RefObject<HTMLDivElement | null>, target: number, prefix = "", duration = 1600) {
  useEffect(() => {
    if (!ref.current) return;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const e = 1 - Math.pow(1 - p, 3);
      if (ref.current) ref.current.textContent = prefix + Math.round(target * e).toLocaleString("es-UY");
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ref, target, prefix, duration]);
}

function toPoints(arr: number[], maxV: number, w = 600, h = 110, pad = 6) {
  return arr.map((v, i) => {
    const x = (i / (arr.length - 1)) * w;
    const y = h - pad - (v / maxV) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export default function Home() {
  const router = useRouter();
  const { isSignedIn } = useUser();
  const revRef = useRef<HTMLDivElement>(null);
  const ordRef = useRef<HTMLDivElement>(null);
  const uniRef = useRef<HTMLDivElement>(null);
  const ticRef = useRef<HTMLDivElement>(null);

  useCountUp(revRef, 114441, "$");
  useCountUp(ordRef, 50);
  useCountUp(uniRef, 63);
  useCountUp(ticRef, 2289, "$");

  const cur  = [45,52,48,65,80,72,58,66,74,60,55,70,78,85,68,72,90,82,75,88,80,70,65,78,85,92,80,75,88,95];
  const prev = [30,35,38,42,48,45,40,50,55,48,42,55,60,58,50,55,62,58,52,60,55,50,48,55,58,62,55,50,58,60];
  const maxV = Math.max(...cur, ...prev) * 1.1;

  const goSignUp = () => router.push(isSignedIn ? "/dashboard" : "/sign-up");
  const goSignIn = () => router.push(isSignedIn ? "/dashboard" : "/sign-in");
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div style={{ background: "#0C0C10", color: "#F0F0F8", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        .dashbi-landing * { box-sizing: border-box; }
        .dashbi-landing a { color: inherit; text-decoration: none; }
        .badge-dot { animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
        @media (max-width: 820px) { .nav-links { display: none !important; } }
        @media (max-width: 700px) { .dash-inner { grid-template-columns: 1fr !important; } .dash-side { display: none !important; } .kpi-row { grid-template-columns: repeat(2,1fr) !important; } .stats-inner { grid-template-columns: 1fr !important; gap: 28px !important; } }
        @media (max-width: 760px) { .feat-grid { grid-template-columns: 1fr !important; } .pricing-grid { grid-template-columns: 1fr !important; } }
        @media (max-width: 800px) { .profit-inner { grid-template-columns: 1fr !important; gap: 36px !important; } }
      `}</style>

      <div className="dashbi-landing">

        <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 48px", borderBottom: "1px solid #22222E", position: "sticky", top: 0, zIndex: 100, background: "rgba(12,12,16,0.85)", backdropFilter: "blur(14px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "'DM Serif Display', serif", fontSize: 19 }}>
            <div style={{ width: 30, height: 30, background: "#EA580C", borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>D</div>
            Dashbi
          </div>
          <div className="nav-links" style={{ display: "flex", gap: 36, fontSize: 14, color: "#9494B8" }}>
            <a href="#funciones" onClick={(e) => { e.preventDefault(); scrollTo("funciones"); }}>Funciones</a>
            <a href="#rentabilidad" onClick={(e) => { e.preventDefault(); scrollTo("rentabilidad"); }}>Rentabilidad</a>
            <a href="#precios" onClick={(e) => { e.preventDefault(); scrollTo("precios"); }}>Precios</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span onClick={goSignIn} style={{ fontSize: 14, color: "#9494B8", cursor: "pointer" }}>Iniciar sesión</span>
            <button onClick={goSignUp} style={{ background: "#EA580C", color: "#fff", padding: "10px 20px", borderRadius: 9, fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer" }}>Empezar gratis</button>
          </div>
        </nav>

        <section style={{ padding: "88px 24px 8px", textAlign: "center", maxWidth: 760, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(234,88,12,0.12)", border: "1px solid rgba(234,88,12,0.3)", color: "#F97316", padding: "6px 16px", borderRadius: 100, fontSize: 13, fontWeight: 500, marginBottom: 30 }}>
            <span className="badge-dot" style={{ width: 6, height: 6, background: "#EA580C", borderRadius: "50%" }} />
            Hecho para vendedores de MercadoLibre
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(38px,6vw,58px)", lineHeight: 1.08, letterSpacing: -1.5, marginBottom: 22 }}>
            Sabé si ganás<br />o perdés <em style={{ fontStyle: "italic", color: "#F97316" }}>en cada venta</em>
          </h1>
          <p style={{ color: "#9494B8", fontSize: 17, lineHeight: 1.65, fontWeight: 300, maxWidth: 560, margin: "0 auto 36px" }}>
            Dashbi conecta tu cuenta de MercadoLibre y te muestra ventas, rentabilidad y stock en tiempo real — sin planillas, sin cargar nada a mano.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <button onClick={goSignUp} style={{ padding: "14px 28px", borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: "pointer", background: "#EA580C", color: "#fff", border: "none" }}>Empezar gratis →</button>
            <button onClick={() => scrollTo("funciones")} style={{ padding: "14px 28px", borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: "pointer", background: "transparent", color: "#F0F0F8", border: "1px solid #2E2E3A" }}>Ver funciones</button>
          </div>
          <p style={{ color: "#65658A", fontSize: 12.5 }}>15 días gratis · Sin tarjeta de crédito · Conexión en 2 minutos</p>
        </section>

        <div style={{ padding: "0 24px", maxWidth: 900, margin: "52px auto 0" }}>
          <div style={{ background: "#16161E", border: "1px solid #22222E", borderRadius: 18, overflow: "hidden", boxShadow: "0 40px 100px -40px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 18px", borderBottom: "1px solid #22222E", background: "#111116" }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57" }} />
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#febc2e" }} />
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840" }} />
              <div style={{ flex: 1, textAlign: "center", fontSize: 11.5, color: "#65658A", fontFamily: "'DM Mono', monospace" }}>dashbi.app/dashboard</div>
            </div>
            <div className="dash-inner" style={{ display: "grid", gridTemplateColumns: "170px 1fr" }}>
              <div className="dash-side" style={{ borderRight: "1px solid #22222E", padding: "18px 12px", background: "#111116" }}>
                <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 14, padding: "6px 10px", marginBottom: 14 }}>Dashbi<span style={{ color: "#F97316" }}>.</span></div>
                <div style={{ padding: "9px 10px", borderRadius: 9, fontSize: 12.5, background: "#F0F0F8", color: "#0C0C10", fontWeight: 600, marginBottom: 2 }}>Resumen</div>
                <div style={{ padding: "9px 10px", borderRadius: 9, fontSize: 12.5, color: "#65658A", marginBottom: 2 }}>Órdenes</div>
                <div style={{ fontSize: 9.5, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.08em", padding: "14px 10px 6px" }}>Finanzas</div>
                <div style={{ padding: "9px 10px", borderRadius: 9, fontSize: 12.5, color: "#65658A" }}>Productos</div>
              </div>
              <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="kpi-row" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10 }}>
                  <div style={{ background: "#1E1E28", borderRadius: 11, padding: 13 }}>
                    <div style={{ fontSize: 10, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Ingresos hoy</div>
                    <div ref={revRef} style={{ fontFamily: "'DM Mono', monospace", fontSize: 19, fontWeight: 500, color: "#F97316" }}>$0</div>
                    <div style={{ fontSize: 10.5, marginTop: 6, fontFamily: "'DM Mono', monospace", color: "#22C55E" }}>▲ 12.4%</div>
                  </div>
                  <div style={{ background: "#1E1E28", borderRadius: 11, padding: 13 }}>
                    <div style={{ fontSize: 10, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Órdenes</div>
                    <div ref={ordRef} style={{ fontFamily: "'DM Mono', monospace", fontSize: 19, fontWeight: 500 }}>0</div>
                    <div style={{ fontSize: 10.5, marginTop: 6, fontFamily: "'DM Mono', monospace", color: "#22C55E" }}>▲ 6.1%</div>
                  </div>
                  <div style={{ background: "#1E1E28", borderRadius: 11, padding: 13 }}>
                    <div style={{ fontSize: 10, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Unidades</div>
                    <div ref={uniRef} style={{ fontFamily: "'DM Mono', monospace", fontSize: 19, fontWeight: 500 }}>0</div>
                    <div style={{ fontSize: 10.5, marginTop: 6, fontFamily: "'DM Mono', monospace", color: "#22C55E" }}>▲ 8.7%</div>
                  </div>
                  <div style={{ background: "#1E1E28", borderRadius: 11, padding: 13 }}>
                    <div style={{ fontSize: 10, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Ticket prom.</div>
                    <div ref={ticRef} style={{ fontFamily: "'DM Mono', monospace", fontSize: 19, fontWeight: 500 }}>$0</div>
                    <div style={{ fontSize: 10.5, marginTop: 6, fontFamily: "'DM Mono', monospace", color: "#EF4444" }}>▼ 1.2%</div>
                  </div>
                  <div style={{ background: "#1E1E28", borderRadius: 11, padding: 13 }}>
                    <div style={{ fontSize: 10, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Rentabilidad</div>
                    <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 19, fontWeight: 500, color: "#F97316" }}>38.2%</div>
                    <div style={{ fontSize: 10.5, marginTop: 6, fontFamily: "'DM Mono', monospace", color: "#22C55E" }}>▲ 2.3pp</div>
                  </div>
                </div>

                <div style={{ background: "#1E1E28", borderRadius: 11, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>Junio vs Mayo — ingresos diarios</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 10.5, color: "#65658A" }}>
                      <span><span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", marginRight: 5, background: "#F97316" }} />Este mes</span>
                      <span><span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", marginRight: 5, background: "#65658A" }} />Mes anterior</span>
                    </div>
                  </div>
                  <svg style={{ width: "100%", height: 110, display: "block" }} viewBox="0 0 600 110" preserveAspectRatio="none">
                    <polyline fill="none" stroke="#65658A" strokeWidth="1.5" strokeDasharray="4 3" points={toPoints(prev, maxV)} />
                    <polyline fill="none" stroke="#F97316" strokeWidth="2.2" points={toPoints(cur, maxV)} />
                  </svg>
                </div>

                <div style={{ background: "#1E1E28", borderRadius: 11, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #22222E" }}>
                    <div>
                      <div style={{ fontSize: 12 }}>Set 3 Cajas Organizadoras</div>
                      <div style={{ fontSize: 10, color: "#65658A", fontFamily: "'DM Mono', monospace" }}>IDOS042 · 2 uds</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>$2.480</div>
                      <div style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: "#22C55E" }}>+34.1%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #22222E" }}>
                    <div>
                      <div style={{ fontSize: 12 }}>Estantería Metálica 5 Niveles</div>
                      <div style={{ fontSize: 10, color: "#65658A", fontFamily: "'DM Mono', monospace" }}>IDOS018 · 1 ud</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>$5.590</div>
                      <div style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: "#22C55E" }}>+28.6%</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0" }}>
                    <div>
                      <div style={{ fontSize: 12 }}>Colchón Inflable 1 Plaza</div>
                      <div style={{ fontSize: 10, color: "#65658A", fontFamily: "'DM Mono', monospace" }}>IDOS099 · 1 ud</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, fontFamily: "'DM Mono', monospace" }}>$687</div>
                      <div style={{ fontSize: 10.5, fontFamily: "'DM Mono', monospace", color: "#EF4444" }}>-4.2%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "64px 24px", borderTop: "1px solid #22222E", borderBottom: "1px solid #22222E", marginTop: 64 }}>
          <div className="stats-inner" style={{ maxWidth: 900, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32, textAlign: "center" }}>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: "#F97316", marginBottom: 6 }}>2 min</div>
              <div style={{ fontSize: 13.5, color: "#9494B8", maxWidth: 220, margin: "0 auto" }}>para conectar tu cuenta y empezar a ver tus datos</div>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: "#F97316", marginBottom: 6 }}>24/7</div>
              <div style={{ fontSize: 13.5, color: "#9494B8", maxWidth: 220, margin: "0 auto" }}>sincronización automática, sin cargar nada a mano</div>
            </div>
            <div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 38, color: "#F97316", marginBottom: 6 }}>100%</div>
              <div style={{ fontSize: 13.5, color: "#9494B8", maxWidth: 220, margin: "0 auto" }}>de tus ventas con rentabilidad real calculada</div>
            </div>
          </div>
        </div>

        <section id="funciones" style={{ padding: "80px 24px", maxWidth: 920, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, textAlign: "center" }}>Funciones</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px,4vw,38px)", lineHeight: 1.15, textAlign: "center", letterSpacing: -0.5, marginBottom: 14 }}>
            Todo lo que necesitás<br />para vender con datos
          </h2>
          <p style={{ color: "#9494B8", fontSize: 15, textAlign: "center", maxWidth: 480, margin: "0 auto 48px", fontWeight: 300 }}>
            Conectás tu MercadoLibre una vez. Dashbi hace el resto.
          </p>
          <div className="feat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            {[
              { title: "Ventas día a día", desc: "Mirá cómo va tu día comparado con ayer, y tu mes comparado con el anterior — sin abrir una sola planilla." },
              { title: "Rentabilidad por venta", desc: "Cada orden muestra si ganaste o perdiste plata, con el costo de mercadería, comisión y envío ya descontados." },
              { title: "Evolución mensual", desc: "Compará este mes contra el anterior y contra el mismo mes del año pasado, con un solo vistazo." },
              { title: "Stock sin duplicados", desc: "Las publicaciones repetidas por catálogo se agrupan automáticamente por SKU — un solo número de verdad." },
              { title: "Costos por producto", desc: "Cargás el costo de cada SKU una vez y Dashbi calcula la rentabilidad real de ahí en adelante, sola." },
              { title: "Siempre actualizado", desc: "Tus ventas, envíos y publicaciones se sincronizan automáticamente cada pocos minutos." },
            ].map((f, i) => (
              <div key={i} style={{ background: "#16161E", border: "1px solid #22222E", borderRadius: 15, padding: "26px 22px" }}>
                <div style={{ width: 38, height: 38, background: "rgba(234,88,12,0.12)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, fontSize: 17, color: "#F97316" }}>◆</div>
                <h3 style={{ fontSize: 15.5, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
                <p style={{ fontSize: 13.5, color: "#9494B8", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="rentabilidad" style={{ background: "#111116", borderTop: "1px solid #22222E", borderBottom: "1px solid #22222E", padding: "80px 24px" }}>
          <div className="profit-inner" style={{ maxWidth: 920, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 52, alignItems: "center" }}>
            <div>
              <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(26px,4vw,34px)", lineHeight: 1.2, marginBottom: 16, letterSpacing: -0.5 }}>
                Dejá de adivinar<br />si estás ganando
              </h2>
              <p style={{ color: "#9494B8", fontSize: 14.5, lineHeight: 1.7, marginBottom: 22, fontWeight: 300 }}>
                La mayoría de los vendedores conoce sus ingresos brutos, pero no su rentabilidad real. Dashbi descuenta comisión, envío y costo de mercadería de cada venta — automáticamente.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {["Rentabilidad por orden, por producto y por mes", "Desglose completo de dónde se va cada peso", "Alertas cuando un producto vende a pérdida"].map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 20, height: 20, background: "rgba(34,197,94,0.12)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "#22C55E", fontSize: 12, flexShrink: 0, marginTop: 1 }}>✓</div>
                    <span style={{ fontSize: 14 }}>{t}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: "#16161E", border: "1px solid #22222E", borderRadius: 16, padding: 22 }}>
              <div style={{ fontSize: 13, color: "#65658A", marginBottom: 18, fontFamily: "'DM Mono', monospace" }}>Desglose financiero — este mes</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #22222E" }}>
                <span style={{ fontSize: 13, color: "#9494B8" }}>Ingresos brutos</span>
                <span style={{ fontSize: 13.5, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#F0F0F8" }}>$636.572</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #22222E" }}>
                <span style={{ fontSize: 13, color: "#9494B8" }}>Comisiones ML</span>
                <span style={{ fontSize: 13.5, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#EF4444" }}>-$70.023</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #22222E" }}>
                <span style={{ fontSize: 13, color: "#9494B8" }}>Envíos</span>
                <span style={{ fontSize: 13.5, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#EF4444" }}>-$48.912</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid #22222E" }}>
                <span style={{ fontSize: 13, color: "#9494B8" }}>Costo de mercadería</span>
                <span style={{ fontSize: 13.5, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#EF4444" }}>-$294.637</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14 }}>
                <span style={{ fontSize: 13, color: "#F0F0F8", fontWeight: 600 }}>Rentabilidad</span>
                <span style={{ fontSize: 16, fontFamily: "'DM Mono', monospace", fontWeight: 500, color: "#F97316" }}>$223.000</span>
              </div>
            </div>
          </div>
        </section>

        <section id="precios" style={{ padding: "80px 24px", maxWidth: 920, margin: "0 auto" }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 14, textAlign: "center" }}>Precios</div>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px,4vw,38px)", lineHeight: 1.15, textAlign: "center", letterSpacing: -0.5, marginBottom: 14 }}>
            Simple y transparente
          </h2>
          <p style={{ color: "#9494B8", fontSize: 15, textAlign: "center", maxWidth: 480, margin: "0 auto 48px", fontWeight: 300 }}>
            Un plan, todas las funciones. Empezá gratis y decidí después.
          </p>
          <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
            <div style={{ background: "#16161E", border: "1px solid #22222E", borderRadius: 17, padding: "30px 26px", position: "relative" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Básico</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1, marginBottom: 2 }}>
                <sup style={{ fontSize: 19, verticalAlign: "super", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#9494B8" }}>US$</sup>19
              </div>
              <div style={{ fontSize: 13, color: "#65658A", marginBottom: 26 }}>por mes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {["Dashboard completo", "Sincronización automática", "Rentabilidad por venta", "Hasta 200 publicaciones"].map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "#9494B8" }}>
                    <span style={{ color: "#F97316", fontWeight: 700 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button onClick={goSignUp} style={{ width: "100%", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", background: "transparent", color: "#F0F0F8", border: "1px solid #2E2E3A" }}>Empezar gratis</button>
            </div>
            <div style={{ background: "#16161E", border: "1px solid #EA580C", borderRadius: 17, padding: "30px 26px", position: "relative" }}>
              <div style={{ position: "absolute", top: -11, left: 26, background: "#EA580C", color: "#fff", fontSize: 11, fontWeight: 600, padding: "4px 12px", borderRadius: 100 }}>Más elegido</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Pro</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1, marginBottom: 2 }}>
                <sup style={{ fontSize: 19, verticalAlign: "super", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#9494B8" }}>US$</sup>39
              </div>
              <div style={{ fontSize: 13, color: "#65658A", marginBottom: 26 }}>por mes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {["Todo lo del plan Básico", "Publicaciones ilimitadas", "Historial completo de ventas", "Soporte prioritario"].map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "#9494B8" }}>
                    <span style={{ color: "#F97316", fontWeight: 700 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button onClick={goSignUp} style={{ width: "100%", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", background: "#EA580C", color: "#fff", border: "none" }}>Empezar gratis →</button>
            </div>
            <div style={{ background: "#16161E", border: "1px solid #22222E", borderRadius: 17, padding: "30px 26px", position: "relative" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#65658A", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Agencia</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 42, lineHeight: 1, marginBottom: 2 }}>
                <sup style={{ fontSize: 19, verticalAlign: "super", fontFamily: "'DM Sans', sans-serif", fontWeight: 300, color: "#9494B8" }}>US$</sup>89
              </div>
              <div style={{ fontSize: 13, color: "#65658A", marginBottom: 26 }}>por mes</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
                {["Todo lo del plan Pro", "Múltiples cuentas de ML", "Usuarios ilimitados", "Onboarding dedicado"].map((f, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13.5, color: "#9494B8" }}>
                    <span style={{ color: "#F97316", fontWeight: 700 }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button onClick={goSignUp} style={{ width: "100%", padding: 12, borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: "pointer", background: "transparent", color: "#F0F0F8", border: "1px solid #2E2E3A" }}>Hablar con ventas</button>
            </div>
          </div>
        </section>

        <section style={{ padding: "88px 24px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: "clamp(28px,4.5vw,40px)", letterSpacing: -0.5, maxWidth: 560, margin: "0 auto 30px", lineHeight: 1.2 }}>
            Conectá tu MercadoLibre<br />y empezá a ver tus números reales
          </h2>
          <button onClick={goSignUp} style={{ padding: "14px 28px", borderRadius: 11, fontSize: 15, fontWeight: 500, cursor: "pointer", background: "#EA580C", color: "#fff", border: "none" }}>Empezar gratis →</button>
          <p style={{ color: "#65658A", fontSize: 13, marginTop: 18 }}>15 días gratis · Sin tarjeta de crédito</p>
        </section>

        <footer style={{ padding: "32px 48px", borderTop: "1px solid #22222E", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, color: "#65658A", fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: "'DM Serif Display', serif", fontSize: 16, color: "#F0F0F8" }}>
            <div style={{ width: 22, height: 22, background: "#EA580C", borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontFamily: "'DM Sans', sans-serif", fontWeight: 700 }}>D</div>
            Dashbi
          </div>
          <div style={{ display: "flex", gap: 22 }}>
            <a href="#">Términos</a>
            <a href="#">Privacidad</a>
            <a href="#">Contacto</a>
          </div>
        </footer>
      </div>
    </div>
  );
}
