import { NextResponse } from "next/server";
import { mergeWebsiteSettings } from "@/lib/cms2/defaults";
import type { CmsWebsiteSettings } from "@/lib/cms2/types";
import { isReservedOrgSlug } from "@/lib/cms2/reserved-slugs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase.from("memberships").select("tenant_id, role").eq("user_id", user.id);
  const ownerTenant = (memberships ?? []).find((m) => (m.role ?? "").toLowerCase() === "owner");
  if (!ownerTenant?.tenant_id) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }

  const { data: row, error } = await admin
    .from("tenant_public_website")
    .select("slug, published, settings")
    .eq("tenant_id", ownerTenant.tenant_id)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("tenant_public_website")) {
      return NextResponse.json({ slug: "", published: false, settings: mergeWebsiteSettings({}) });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    slug: row?.slug ?? "",
    published: row?.published ?? false,
    settings: mergeWebsiteSettings(row?.settings),
  });
}

export async function PUT(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await supabase.from("memberships").select("tenant_id, role").eq("user_id", user.id);
  const ownerTenant = (memberships ?? []).find((m) => (m.role ?? "").toLowerCase() === "owner");
  if (!ownerTenant?.tenant_id) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: { slug?: string; published?: boolean; settings?: CmsWebsiteSettings };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slug = (body.slug ?? "").trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug (lowercase letters, numbers, hyphens)" }, { status: 400 });
  }
  if (isReservedOrgSlug(slug)) {
    return NextResponse.json({ error: "This slug is reserved" }, { status: 400 });
  }

  const settings = mergeWebsiteSettings(body.settings ?? {});

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }

  const { error } = await admin.from("tenant_public_website").upsert(
    {
      tenant_id: ownerTenant.tenant_id,
      slug,
      published: Boolean(body.published),
      settings: settings as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );

  if (error) {
    if (error.code === "42P01" || error.message.includes("tenant_public_website")) {
      return NextResponse.json(
        { error: "Run sql/cms2_public_website.sql in Supabase to enable the public website table." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
