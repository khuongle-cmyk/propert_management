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
    .from("marketing_offers")
    .select("*")
    .eq("tenant_id", tenantId!)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ offers: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ offers: data ?? [] });
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

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  let promo = String(body.promo_code ?? "").trim().toUpperCase();
  if (!promo) promo = `PROMO-${randomBytes(4).toString("hex").toUpperCase()}`;

  const insert = {
    tenant_id: tenantId,
    property_id: body.property_id ?? null,
    name,
    description: body.description != null ? String(body.description) : null,
    offer_type: String(body.offer_type ?? "discount_pct"),
    discount_percentage: body.discount_percentage != null ? Number(body.discount_percentage) : null,
    discount_fixed_amount: body.discount_fixed_amount != null ? Number(body.discount_fixed_amount) : null,
    free_months: body.free_months != null ? Number(body.free_months) : null,
    valid_from: body.valid_from ?? null,
    valid_until: body.valid_until ?? null,
    max_uses: body.max_uses != null ? Number(body.max_uses) : null,
    current_uses: 0,
    promo_code: promo,
    applicable_to: String(body.applicable_to ?? "all"),
    status: String(body.status ?? "draft"),
    terms: body.terms != null ? String(body.terms) : null,
  };

  const { data, error } = await supabase.from("marketing_offers").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ offer: data });
}
