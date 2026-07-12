import { NextRequest, NextResponse } from "next/server";
import { getMLAuthUrl } from "@/lib/ml";

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  if (!tenantId) return NextResponse.json({ error: "Missing tenant_id" }, { status: 400 });
  return NextResponse.json({ url: getMLAuthUrl(tenantId) });
}
