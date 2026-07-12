import Link from "next/link";

export default function Home() {
  return (
    <main style={{minHeight:"100vh",background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"40px 20px",textAlign:"center"}}>
      <div style={{marginBottom:24,fontSize:48}}>📦</div>
      <h1 style={{fontFamily:"'DM Serif Display',serif",fontSize:48,letterSpacing:-2,marginBottom:16,color:"var(--text)"}}>
        Dashbi
      </h1>
      <p style={{color:"var(--sub)",fontSize:18,maxWidth:480,marginBottom:40,lineHeight:1.6}}>
        El dashboard que los vendedores profesionales de MercadoLibre necesitan.
      </p>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",justifyContent:"center"}}>
        <Link href="/sign-up" style={{background:"var(--accent)",color:"#fff",padding:"14px 28px",borderRadius:12,fontSize:15,fontWeight:500,textDecoration:"none"}}>
          Empezar gratis →
        </Link>
        <Link href="/sign-in" style={{background:"transparent",color:"var(--text)",padding:"14px 28px",borderRadius:12,fontSize:15,border:"1px solid var(--border)",textDecoration:"none"}}>
          Ya tengo cuenta
        </Link>
      </div>
      <p style={{color:"var(--muted)",fontSize:13,marginTop:20}}>15 días gratis · Sin tarjeta de crédito</p>
    </main>
  );
}
