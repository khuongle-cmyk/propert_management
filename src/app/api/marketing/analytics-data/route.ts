import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMarketingAccess, parseTenantIdParam } from "@/lib/marketing/access";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantIds, isSuperAdmin, error: aErr } = await getMarketingAccess(supabase, user.id);
  if (aErr) return NextResponse.json({ error: aErr }, { status: 500 });
  if (!isSuperAdmin && tenantIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);
  let tenantId = parseTenantIdParam(url, tenantIds);
  if (isSuperAdmin) {
    const q = (url.searchParams.get("tenantId") ?? "").trim();
    if (!q) return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    tenantId = q;
  } else if (!tenantId) {
    return NextResponse.json({ error: "tenantId required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("marketing_analytics")
    .select("*")
    .eq("tenant_id", tenantId!)
    .order("date", { ascending: false })
    .limit(400);
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ rows: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}
