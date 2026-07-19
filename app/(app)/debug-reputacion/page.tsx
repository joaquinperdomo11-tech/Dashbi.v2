"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

export default function DebugReputacion() {
  const { isSignedIn } = useUser();
  const [raw, setRaw] = useState<any>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    fetch("/api/debug/reputacion-raw").then(r => r.json()).then(setRaw);
  }, [isSignedIn]);

  return <pre style={{padding:20,fontSize:11,whiteSpace:"pre-wrap",color:"#fff",background:"#000"}}>{JSON.stringify(raw, null, 2)}</pre>;
}
