import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <SignUp />
    </div>
  );
}
