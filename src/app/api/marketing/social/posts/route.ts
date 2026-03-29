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
    .from("marketing_social_posts")
    .select("*")
    .eq("tenant_id", tenantId!)
    .order("scheduled_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) {
    if (error.code === "42P01") return NextResponse.json({ posts: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: data ?? [] });
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

  const insert = {
    tenant_id: tenantId,
    campaign_id: body.campaign_id ?? null,
    platform: String(body.platform ?? "linkedin"),
    content_text: body.content_text != null ? String(body.content_text) : null,
    media_urls: Array.isArray(body.media_urls) ? body.media_urls : [],
    scheduled_at: body.scheduled_at ?? null,
    status: String(body.status ?? "draft"),
  };

  const { data, error } = await supabase.from("marketing_social_posts").insert(insert).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ post: data });
}
