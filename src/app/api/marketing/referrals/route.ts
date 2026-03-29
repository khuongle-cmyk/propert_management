import { randomBytes } from "crypto";
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
    .from("marketing_referrals")
    .select("*")
    .eq("tenant_id", tenantId!)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ referrals: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ referrals: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantIds, isSuperAdmin, error: aErr } = await getMarketingAccess(supabase, user.id);
  if (aErr) return NextResponse.json({ error: aErr }, { status: 500 });
  if (!isSuperAdmin && tenantIds.length === 0) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const tenantId = String(body.tenant_id ?? body.tenantId ?? "").trim();
  if (!tenantId || (!isSuperAdmin && !tenantIds.includes(tenantId))) {
    return NextResponse.json({ error: "Invalid tenant" }, { status: 400 });
  }

  let code = String(body.referral_code ?? "").trim().toUpperCase();
  if (!code) code = `REF-${randomBytes(4).toString("hex").toUpperCase()}`;

  const insert = {
    tenant_id: tenantId,
    referrer_contact_id: body.referrer_contact_id ?? null,
    referred_contact_id: body.referred_contact_id ?? null,
    referral_code: code,
    status: String(body.status ?? "pending"),
    reward_type: body.reward_type ?? null,
    reward_amount: body.reward_amount != null ? Number(body.reward_amount) : null,
  };

  const { data, error } = await supabase.from("marketing_referrals").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ referral: data });
}
