import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applyMarketingRowScopeFilter,
  canAccessMarketingRowByTenantId,
  getMarketingAccess,
  resolveMarketingInsertTenantId,
  resolveMarketingTenantScope,
} from "@/lib/marketing/access";

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
  const resolved = await resolveMarketingTenantScope(supabase, url, { tenantIds, isSuperAdmin });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const filtered = applyMarketingRowScopeFilter(
    supabase.from("marketing_offers").select("*").order("created_at", { ascending: false }).limit(200),
    resolved.scope,
  );

  const { data, error } = await filtered;
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

  const resolvedT = resolveMarketingInsertTenantId(body, { tenantIds, isSuperAdmin });
  if (!resolvedT.ok) {
    return NextResponse.json({ error: resolvedT.error }, { status: resolvedT.status });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const OFFER_TYPES = new Set([
    "discount_pct",
    "discount_fixed",
    "free_period",
    "bundle",
    "referral_bonus",
  ]);
  const rawType = String(body.offer_type ?? "discount_pct").trim();
  const offer_type = OFFER_TYPES.has(rawType) ? rawType : "discount_pct";

  /** DB check: offices | meeting_rooms | hot_desks | venues | all — not tenant_id (org is tenant_id). */
  const APPLICABLE = new Set(["offices", "meeting_rooms", "hot_desks", "venues", "all"]);
  const rawApp = String(body.applicable_to ?? "all").trim();
  const applicable_to = APPLICABLE.has(rawApp) ? rawApp : "all";

  let promo = String(body.promo_code ?? "").trim().toUpperCase();
  if (!promo) promo = `PROMO-${randomBytes(4).toString("hex").toUpperCase()}`;

  const insert = {
    tenant_id: resolvedT.tenant_id,
    property_id: body.property_id ?? null,
    name,
    description: body.description != null ? String(body.description) : null,
    offer_type,
    discount_percentage: body.discount_percentage != null ? Number(body.discount_percentage) : null,
    discount_fixed_amount: body.discount_fixed_amount != null ? Number(body.discount_fixed_amount) : null,
    free_months: body.free_months != null ? Number(body.free_months) : null,
    valid_from: body.valid_from ?? null,
    valid_until: body.valid_until ?? null,
    max_uses: body.max_uses != null ? Number(body.max_uses) : null,
    current_uses: 0,
    promo_code: promo,
    applicable_to,
    status: String(body.status ?? "draft"),
    terms: body.terms != null ? String(body.terms) : null,
  };

  const { data, error } = await supabase.from("marketing_offers").insert(insert).select("*").single();
  if (error) {
    console.error("marketing_offers insert error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ offer: data });
}

const OFFER_TYPES = new Set(["discount_pct", "discount_fixed", "free_period", "bundle", "referral_bonus"]);
const APPLICABLE_TO = new Set(["offices", "meeting_rooms", "hot_desks", "venues", "all"]);
const OFFER_STATUSES = new Set(["draft", "active", "expired", "paused", "archived"]);

export async function PATCH(req: Request) {
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

  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Missing offer id" }, { status: 400 });

  const { data: existing, error: exErr } = await supabase.from("marketing_offers").select("id, tenant_id").eq("id", id).maybeSingle();
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessMarketingRowByTenantId(existing.tenant_id, { tenantIds, isSuperAdmin })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cleanUpdates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    cleanUpdates.name = name;
  }

  if (body.description !== undefined) {
    cleanUpdates.description = body.description == null || body.description === "" ? null : String(body.description);
  }

  if (body.offer_type !== undefined) {
    const raw = String(body.offer_type ?? "discount_pct").trim();
    cleanUpdates.offer_type = OFFER_TYPES.has(raw) ? raw : "discount_pct";
  }

  if (body.discount_percentage !== undefined) {
    cleanUpdates.discount_percentage =
      body.discount_percentage == null || body.discount_percentage === "" ? null : Number(body.discount_percentage);
  }

  if (body.discount_fixed_amount !== undefined) {
    cleanUpdates.discount_fixed_amount =
      body.discount_fixed_amount == null || body.discount_fixed_amount === "" ? null : Number(body.discount_fixed_amount);
  }

  if (body.promo_code !== undefined) {
    const p = body.promo_code == null || String(body.promo_code).trim() === "" ? null : String(body.promo_code).trim().toUpperCase();
    cleanUpdates.promo_code = p;
  }

  if (body.status !== undefined) {
    const s = String(body.status ?? "draft").trim();
    cleanUpdates.status = OFFER_STATUSES.has(s) ? s : "draft";
  }

  if (body.max_uses !== undefined) {
    cleanUpdates.max_uses =
      body.max_uses == null || body.max_uses === "" ? null : Number(body.max_uses);
  }

  if (body.valid_from !== undefined) {
    cleanUpdates.valid_from = body.valid_from == null || body.valid_from === "" ? null : String(body.valid_from);
  }

  if (body.valid_until !== undefined) {
    cleanUpdates.valid_until = body.valid_until == null || body.valid_until === "" ? null : String(body.valid_until);
  }

  if (body.applicable_to !== undefined) {
    const a = String(body.applicable_to ?? "all").trim();
    cleanUpdates.applicable_to = APPLICABLE_TO.has(a) ? a : "all";
  }

  if (body.free_months !== undefined) {
    cleanUpdates.free_months =
      body.free_months == null || body.free_months === "" ? null : Number(body.free_months);
  }

  if (body.bundle_description !== undefined) {
    cleanUpdates.bundle_description =
      body.bundle_description == null || body.bundle_description === "" ? null : String(body.bundle_description);
  }

  if (body.referral_bonus_amount !== undefined) {
    cleanUpdates.referral_bonus_amount =
      body.referral_bonus_amount == null || body.referral_bonus_amount === ""
        ? null
        : Number(body.referral_bonus_amount);
  }

  if (body.terms !== undefined) {
    cleanUpdates.terms = body.terms == null || body.terms === "" ? null : String(body.terms);
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("marketing_offers").update(cleanUpdates).eq("id", id).select("*").single();

  if (error) {
    console.error("Update marketing_offers error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ offer: data });
}
