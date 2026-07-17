"use client";
import { useEffect, useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

interface Pregunta {
  id: number;
  questionId: string;
  itemId: string;
  itemTitle: string;
  itemThumbnail: string;
  sku: string;
  fromNickname: string;
  text: string;
  answerText: string | null;
  status: string;
  dateCreated: string;
  dateAnswered: string | null;
}

const MAX_CHARS = 2000;
const DEFAULT_SALUDO = "Hola! Cómo estás?";
const DEFAULT_DESPEDIDA = "Quedamos a las órdenes, saludos!";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-UY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PreguntasPage() {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<"UNANSWERED" | "ANSWERED">("UNANSWERED");
  const [preguntas, setPreguntas] = useState<Pregunta[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [saludo, setSaludo]         = useState(DEFAULT_SALUDO);
  const [despedida, setDespedida]   = useState(DEFAULT_DESPEDIDA);
  const [editingSaludo, setEditingSaludo]     = useState(false);
  const [editingDespedida, setEditingDespedida] = useState(false);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [sending, setSending]       = useState<string | null>(null);
  const [errors, setErrors]         = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { router.push("/sign-in"); return; }
    load(tab);
  }, [isLoaded, isSignedIn, router, tab]);

  const load = async (status: "UNANSWERED" | "ANSWERED") => {
    setLoading(true);
    const res = await fetch(`/api/data/preguntas?status=${status}`);
    const data = await res.json();
    setPreguntas(data.preguntas || []);
    setLoading(false);
  };

  const buildFullMessage = (qId: string) => {
    const body = respuestas[qId] || "";
    return `${saludo}\n\n${body}\n\n${despedida}`;
  };

  const remainingChars = (qId: string) => {
    const fixedLen = saludo.length + despedida.length + 4; // \n\n twice
    return MAX_CHARS - fixedLen - (respuestas[qId] || "").length;
  };

  const handleSend = async (qId: string) => {
    const body = respuestas[qId] || "";
    if (!body.trim()) return;
    setSending(qId);
    setErrors(prev => { const n = { ...prev }; delete n[qId]; return n; });
    const fullText = buildFullMessage(qId);
    const res = await fetch("/api/data/preguntas/responder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: qId, text: fullText }),
    });
    if (res.ok) {
      setRespuestas(prev => { const n = { ...prev }; delete n[qId]; return n; });
      setExpanded(null);
      load(tab);
    } else {
      const err = await res.json();
      let msg = "No se pudo enviar la respuesta. Intentá de nuevo.";
      if (err.detail && err.detail.includes("not_active_item")) {
        msg = "No se puede responder: la publicación está pausada o cerrada en MercadoLibre.";
      } else if (err.error) {
        msg = err.error;
      }
      setErrors(prev => ({ ...prev, [qId]: msg }));
    }
    setSending(null);
  };

  if (loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:60}}>
      <div style={{width:28,height:28,border:"3px solid var(--border)",borderTopColor:"var(--accent)",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{padding:"24px"}}>
      <div style={{maxWidth:760,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>
        <div>
          <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:26,color:"var(--text)"}}>Preguntas</h1>
          <p style={{color:"var(--sub)",fontSize:13,marginTop:4}}>Respondé directo desde acá, sin entrar a MercadoLibre</p>
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={() => setTab("UNANSWERED")}
            style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,
              background: tab === "UNANSWERED" ? "var(--text)" : "var(--card)", color: tab === "UNANSWERED" ? "var(--bg2)" : "var(--sub)"}}>
            Pendientes {tab === "UNANSWERED" && preguntas.length > 0 ? `(${preguntas.length})` : ""}
          </button>
          <button onClick={() => setTab("ANSWERED")}
            style={{padding:"8px 16px",borderRadius:10,border:"none",cursor:"pointer",fontSize:13,fontWeight:500,
              background: tab === "ANSWERED" ? "var(--text)" : "var(--card)", color: tab === "ANSWERED" ? "var(--bg2)" : "var(--sub)"}}>
            Historial
          </button>
        </div>

        {preguntas.length === 0 ? (
          <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:40,textAlign:"center"}}>
            <p style={{color:"var(--sub)",fontSize:14}}>
              {tab === "UNANSWERED" ? "No tenés preguntas pendientes" : "Todavía no hay historial"}
            </p>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {preguntas.map(p => {
              const isOpen = expanded === p.questionId;
              const remaining = remainingChars(p.questionId);
              return (
                <div key={p.questionId} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:18}}>
                  <div style={{display:"flex",gap:12,marginBottom:14}}>
                    {p.itemThumbnail ? (
                      <img src={p.itemThumbnail} alt="" style={{width:48,height:48,borderRadius:10,objectFit:"cover",flexShrink:0}} />
                    ) : (
                      <div style={{width:48,height:48,borderRadius:10,background:"var(--card2)",flexShrink:0}} />
                    )}
                    <div style={{flex:1,minWidth:0}}>
                      <p style={{fontSize:14,fontWeight:500,color:"var(--text)"}}>{p.itemTitle}</p>
                      <p style={{fontSize:12,color:"var(--sub)",fontFamily:"'DM Mono',monospace"}}>
                        {p.sku ? `SKU: ${p.sku} · ` : ""}{fmtDate(p.dateCreated)}
                      </p>
                    </div>
                  </div>

                  <div style={{background:"var(--bg)",borderRadius:12,padding:"12px 14px",marginBottom: tab === "UNANSWERED" ? 14 : 0}}>
                    <p style={{fontSize:14,color:"var(--text)"}}>{p.text}</p>
                  </div>

                  {tab === "ANSWERED" && p.answerText && (
                    <div style={{background:"var(--accent-bg)",borderRadius:12,padding:"12px 14px",marginTop:10}}>
                      <p style={{fontSize:11,color:"var(--accent)",fontWeight:600,marginBottom:4}}>Tu respuesta</p>
                      <p style={{fontSize:13,color:"var(--text)",whiteSpace:"pre-wrap"}}>{p.answerText}</p>
                    </div>
                  )}

                  {tab === "UNANSWERED" && !isOpen && (
                    <button onClick={() => setExpanded(p.questionId)}
                      style={{padding:"8px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--text)",fontSize:13,cursor:"pointer"}}>
                      Responder
                    </button>
                  )}

                  {tab === "UNANSWERED" && isOpen && (
                    <div style={{display:"flex",flexDirection:"column",gap:10}}>
                      {errors[p.questionId] && (
                        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",background:"var(--red-bg)",border:"1px solid var(--red)",borderRadius:10}}>
                          <span style={{fontSize:14}}>⚠️</span>
                          <p style={{fontSize:13,color:"var(--red)"}}>{errors[p.questionId]}</p>
                        </div>
                      )}
                      {/* Saludo */}
                      <div>
                        <label style={{fontSize:11,color:"var(--sub)",display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <span>Saludo inicial</span>
                          <span onClick={() => setEditingSaludo(v => !v)} style={{cursor:"pointer",color:"var(--accent)"}}>✏️</span>
                        </label>
                        <input value={saludo} onChange={e => setSaludo(e.target.value)} readOnly={!editingSaludo}
                          style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background: editingSaludo ? "var(--bg)" : "var(--card2)",color:"var(--text)",fontSize:13}} />
                      </div>

                      {/* Respuesta */}
                      <div>
                        <label style={{fontSize:11,color:"var(--sub)",display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <span>Tu respuesta</span>
                          <span style={{color: remaining < 100 ? "var(--red)" : "var(--muted)"}}>{remaining} caracteres restantes</span>
                        </label>
                        <textarea
                          value={respuestas[p.questionId] || ""}
                          onChange={e => setRespuestas(prev => ({ ...prev, [p.questionId]: e.target.value.slice(0, Math.max(0, remaining + e.target.value.length - (respuestas[p.questionId]||"").length)) }))}
                          placeholder="Escribí tu respuesta acá..."
                          rows={4}
                          style={{width:"100%",padding:"10px 12px",borderRadius:10,border:"1px solid var(--border)",background:"var(--bg)",color:"var(--text)",fontSize:13,resize:"vertical",fontFamily:"'DM Sans',sans-serif"}} />
                      </div>

                      {/* Despedida */}
                      <div>
                        <label style={{fontSize:11,color:"var(--sub)",display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <span>Despedida</span>
                          <span onClick={() => setEditingDespedida(v => !v)} style={{cursor:"pointer",color:"var(--accent)"}}>✏️</span>
                        </label>
                        <input value={despedida} onChange={e => setDespedida(e.target.value)} readOnly={!editingDespedida}
                          style={{width:"100%",padding:"9px 12px",borderRadius:10,border:"1px solid var(--border)",background: editingDespedida ? "var(--bg)" : "var(--card2)",color:"var(--text)",fontSize:13}} />
                      </div>

                      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
                        <button onClick={() => { setExpanded(null); setRespuestas(prev => { const n = { ...prev }; delete n[p.questionId]; return n; }); }}
                          style={{padding:"9px 16px",borderRadius:10,border:"1px solid var(--border)",background:"transparent",color:"var(--sub)",fontSize:13,cursor:"pointer"}}>
                          Descartar
                        </button>
                        <button onClick={() => handleSend(p.questionId)} disabled={sending === p.questionId || !(respuestas[p.questionId] || "").trim()}
                          style={{padding:"9px 18px",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontSize:13,fontWeight:500,cursor:"pointer",opacity: sending === p.questionId ? 0.6 : 1}}>
                          {sending === p.questionId ? "Enviando..." : "Enviar respuesta"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
