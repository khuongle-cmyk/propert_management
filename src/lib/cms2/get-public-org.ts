import { cache } from "react";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_LOGO_FALLBACK,
  defaultRootOrgSlug,
  mergeWebsiteSettings,
  VILLAGEWORKS_DEFAULT_CMS_SETTINGS,
} from "./defaults";
import type { CmsPublicSpace, PublicOrgPayload } from "./types";

function fallbackOrg(slug: string): PublicOrgPayload {
  return {
    tenantId: "",
    slug,
    published: true,
    brandName: slug === "villageworks" ? "VillageWorks" : slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    logoUrl: DEFAULT_LOGO_FALLBACK,
    primaryColor: "#1a5c5a",
    secondaryColor: "#2d8b87",
    settings: { ...VILLAGEWORKS_DEFAULT_CMS_SETTINGS },
    properties: [],
    spaces: [],
  };
}

async function loadOrgFromDb(slug: string): Promise<PublicOrgPayload | null> {
  let admin;
  try {
    admin = getSupabaseAdminClient();
  } catch {
    return null;
  }

  const slugLower = slug.toLowerCase();

  const { data: row, error } = await admin
    .from("tenant_public_website")
    .select("tenant_id, slug, published, settings")
    .ilike("slug", slugLower)
    .maybeSingle();

  if (error) {
    if (error.code === "42P01" || error.message.includes("tenant_public_website")) {
      return null;
    }
    console.warn("cms2 load org:", error.message);
    return null;
  }

  if (!row) return null;

  const tenantId = row.tenant_id as string;
  const published = Boolean(row.published);

  const { data: tenant } = await admin.from("tenants").select("name").eq("id", tenantId).maybeSingle();

  const { data: brand } = await admin.from("brand_settings").select("brand_name, logo_url, primary_color, secondary_color").eq("tenant_id", tenantId).maybeSingle();

  const { data: props } = await admin
    .from("properties")
    .select("id, name, city")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });

  const propertyList = (props ?? []) as { id: string; name: string; city: string | null }[];
  const propertyIds = propertyList.map((p) => p.id);
  const nameByProp = Object.fromEntries(propertyList.map((p) => [p.id, p.name]));

  let spaceRows: Record<string, unknown>[] = [];
  if (propertyIds.length) {
    const { data, error: spaceErr } = await admin
      .from("bookable_spaces")
      .select("id, property_id, name, space_type, hourly_price, capacity, requires_approval, space_status")
      .in("property_id", propertyIds)
      .eq("space_status", "available");
    if (spaceErr) console.warn("cms2 spaces:", spaceErr.message);
    else spaceRows = (data ?? []) as Record<string, unknown>[];
  }

  const settings = mergeWebsiteSettings(row.settings);

  let spaces: CmsPublicSpace[] = spaceRows
    .filter((s: { space_type?: string }) => s.space_type !== "office")
    .map((s: Record<string, unknown>) => ({
      id: String(s.id),
      propertyId: String(s.property_id),
      propertyName: nameByProp[String(s.property_id)] ?? "",
      name: String(s.name),
      spaceType: String(s.space_type),
      hourlyPrice: Number(s.hourly_price) || 0,
      capacity: Number(s.capacity) || 1,
      requiresApproval: Boolean(s.requires_approval),
    }));

  if (settings.publicSpaceIds?.length) {
    const allow = new Set(settings.publicSpaceIds);
    spaces = spaces.filter((s) => allow.has(s.id));
  }

  return {
    tenantId,
    slug: row.slug as string,
    published,
    brandName: (brand?.brand_name as string) || (tenant?.name as string) || slug,
    logoUrl: (brand?.logo_url as string) || null,
    primaryColor: (brand?.primary_color as string) || "#1a5c5a",
    secondaryColor: (brand?.secondary_color as string) || "#2d8b87",
    settings,
    properties: propertyList,
    spaces,
  };
}

/**
 * Root domain `/` — uses NEXT_PUBLIC_DEFAULT_PUBLIC_ORG_SLUG (default villageworks).
 * Falls back to static content when DB row missing or unpublished.
 */
export async function getRootMarketingOrg(): Promise<PublicOrgPayload> {
  const effective = defaultRootOrgSlug().toLowerCase();
  const fromDb = await loadOrgFromDb(effective);
  if (fromDb) {
    if (!fromDb.published) {
      const fb = fallbackOrg(effective);
      return { ...fb, tenantId: fromDb.tenantId };
    }
    return fromDb;
  }
  return fallbackOrg(effective);
}

/** Multi-tenant `/{slug}/…` — strict: unknown or unpublished slug → null (404). */
export async function getOrgPublicSiteBySlug(slug: string): Promise<PublicOrgPayload | null> {
  const fromDb = await loadOrgFromDb(slug.toLowerCase());
  if (!fromDb || !fromDb.published) return null;
  return fromDb;
}

export const getRootMarketingOrgCached = cache(getRootMarketingOrg);
export const getOrgPublicSiteCached = cache(async (slug: string) => getOrgPublicSiteBySlug(slug));
