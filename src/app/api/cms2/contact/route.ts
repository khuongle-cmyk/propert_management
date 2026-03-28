import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendLeadCreatedEmails } from "@/lib/leads-email";

type Body = {
  orgSlug?: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  interestedSpaceType?: string;
  message?: string;
  propertyId?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgSlug = (body.orgSlug ?? "").trim().toLowerCase() || null;
  const contactName = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const companyName = (body.company ?? "").trim() || "Individual";
  const phone = (body.phone ?? "").trim() || null;
  const notes = (body.message ?? "").trim() || null;
  const interestedSpaceType = (body.interestedSpaceType ?? "").trim() || null;
  const propertyId = (body.propertyId ?? "").trim() || null;

  if (!contactName || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server misconfiguration" }, { status: 500 });
  }

  let tenantId: string | null = null;
  let pipelineSlug: string | null = null;

  if (orgSlug) {
    const { data: site } = await admin.from("tenant_public_website").select("tenant_id, settings").ilike("slug", orgSlug).maybeSingle();
    if (site?.tenant_id) {
      tenantId = site.tenant_id as string;
      const settings = (site.settings ?? {}) as { pipelineSlug?: string | null };
      pipelineSlug = typeof settings.pipelineSlug === "string" ? settings.pipelineSlug : null;
    }
  }

  if (!tenantId) {
    const envTenantId = process.env.DEFAULT_LEAD_TENANT_ID?.trim();
    if (envTenantId) tenantId = envTenantId;
  }
  if (!tenantId) {
    const { data: first } = await admin.from("tenants").select("id").limit(1).maybeSingle();
    tenantId = (first?.id as string) ?? null;
  }
  if (!tenantId) return NextResponse.json({ error: "No organization configured for leads" }, { status: 400 });

  let pipelineOwner = tenantId;
  if (pipelineSlug) {
    const { data: settings } = await admin
      .from("crm_pipeline_settings")
      .select("tenant_id, enabled")
      .eq("contact_slug", pipelineSlug)
      .maybeSingle();
    if (settings?.enabled) {
      pipelineOwner = settings.tenant_id as string;
    }
  }

  const payload = {
    tenant_id: tenantId,
    pipeline_owner: pipelineOwner,
    property_id: propertyId,
    company_name: companyName,
    contact_person_name: contactName,
    email,
    phone,
    source: "website" as const,
    interested_space_type: interestedSpaceType,
    notes,
  };

  const { data: created, error } = await admin.from("leads").insert(payload).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await sendLeadCreatedEmails(admin, tenantId, {
    companyName,
    contactName,
    email,
    phone,
    source: "website",
    interestedSpaceType,
    message: notes,
  });

  return NextResponse.json({ ok: true, leadId: created?.id ?? null });
}
