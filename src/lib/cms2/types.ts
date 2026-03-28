import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";

export type CmsTestimonial = { quote: string; author: string; role?: string };
export type CmsGalleryItem = { url: string; caption?: string; propertyId?: string };
export type CmsFaqItem = { q: string; a: string };

/** Editable public website content (stored in tenant_public_website.settings JSON). */
export type CmsWebsiteSettings = {
  headline: string;
  subheadline: string;
  heroImageUrl: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactAddress: string | null;
  showPrices: boolean;
  testimonials: CmsTestimonial[];
  gallery: CmsGalleryItem[];
  faq: CmsFaqItem[];
  /** Limit listed spaces; empty / null = all non-office bookable spaces */
  publicSpaceIds: string[] | null;
  /** Optional CRM pipeline slug for contact form routing */
  pipelineSlug: string | null;
  seoDescription: string | null;
  /** Partial per-locale overrides (keys: fi, en, sv, es, fr) */
  translations?: Record<string, Partial<Pick<CmsWebsiteSettings, "headline" | "subheadline" | "seoDescription">>>;
};

export type CmsPublicProperty = { id: string; name: string; city: string | null };

export type CmsPublicSpace = {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  spaceType: string;
  hourlyPrice: number;
  capacity: number;
  requiresApproval: boolean;
};

export type PublicOrgPayload = {
  tenantId: string;
  slug: string;
  published: boolean;
  brandName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  settings: CmsWebsiteSettings;
  properties: CmsPublicProperty[];
  spaces: CmsPublicSpace[];
};

export type CmsTheme = {
  petrol: string;
  petrolDark: string;
  teal: string;
  mint: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accentBg: string;
};

export function themeFromBrand(primary: string, secondary: string): CmsTheme {
  return {
    petrol: primary,
    petrolDark: "#0d3d3b",
    teal: secondary,
    mint: "#5cb3af",
    bg: "#f8fafa",
    surface: "#ffffff",
    text: "#1a2e2e",
    muted: "#4b6b6a",
    border: "#e2ecec",
    accentBg: "#e8f4f3",
  };
}

export const CMS2_STATIC_THEME: CmsTheme = themeFromBrand(
  VILLAGEWORKS_BRAND.colors.primary,
  VILLAGEWORKS_BRAND.colors.secondary,
);
