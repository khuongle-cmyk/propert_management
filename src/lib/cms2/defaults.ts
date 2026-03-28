import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";
import type { CmsGalleryItem, CmsWebsiteSettings } from "./types";

export const VILLAGEWORKS_DEFAULT_CMS_SETTINGS: CmsWebsiteSettings = {
  headline: "Workspace that works for your business",
  subheadline:
    "Flexible offices, meeting rooms, and venues — book online or talk to our team. One platform for landlords and tenants.",
  heroImageUrl: null,
  contactEmail: "hello@villageworks.com",
  contactPhone: null,
  contactAddress: null,
  showPrices: true,
  testimonials: [
    {
      quote: "Smooth booking flow and great spaces for our team offsites.",
      author: "Operations lead",
      role: "Tech company",
    },
  ],
  gallery: [],
  faq: [
    {
      q: "How do I book a meeting room?",
      a: "Choose a space, pick a time, and confirm — you will receive email confirmation.",
    },
    {
      q: "Do you offer office leases?",
      a: "Yes — use Enquire on office listings and our team will follow up via CRM.",
    },
  ],
  publicSpaceIds: null,
  pipelineSlug: null,
  seoDescription:
    "VillageWorks — flexible workspaces, meeting rooms, and venues. Book online or enquire for offices.",
  translations: {},
};

export const DEFAULT_LOGO_FALLBACK = VILLAGEWORKS_BRAND.logoPetrol;

/** Env: primary public org slug when URL is `/` (VillageWorks marketing home). */
export function defaultRootOrgSlug(): string {
  return (process.env.NEXT_PUBLIC_DEFAULT_PUBLIC_ORG_SLUG ?? "villageworks").toLowerCase().trim();
}

export function mergeWebsiteSettings(raw: unknown): CmsWebsiteSettings {
  const base = { ...VILLAGEWORKS_DEFAULT_CMS_SETTINGS };
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    headline: typeof o.headline === "string" ? o.headline : base.headline,
    subheadline: typeof o.subheadline === "string" ? o.subheadline : base.subheadline,
    heroImageUrl: typeof o.heroImageUrl === "string" ? o.heroImageUrl : o.heroImageUrl === null ? null : base.heroImageUrl,
    contactEmail: typeof o.contactEmail === "string" ? o.contactEmail : base.contactEmail,
    contactPhone: typeof o.contactPhone === "string" ? o.contactPhone : base.contactPhone,
    contactAddress: typeof o.contactAddress === "string" ? o.contactAddress : base.contactAddress,
    showPrices: typeof o.showPrices === "boolean" ? o.showPrices : base.showPrices,
    testimonials: Array.isArray(o.testimonials) ? (o.testimonials as CmsWebsiteSettings["testimonials"]) : base.testimonials,
    gallery: Array.isArray(o.gallery) ? (o.gallery as CmsGalleryItem[]) : base.gallery,
    faq: Array.isArray(o.faq) ? (o.faq as CmsWebsiteSettings["faq"]) : base.faq,
    publicSpaceIds: Array.isArray(o.publicSpaceIds) ? (o.publicSpaceIds as string[]) : o.publicSpaceIds === null ? null : base.publicSpaceIds,
    pipelineSlug: typeof o.pipelineSlug === "string" ? o.pipelineSlug : o.pipelineSlug === null ? null : base.pipelineSlug,
    seoDescription: typeof o.seoDescription === "string" ? o.seoDescription : base.seoDescription,
    translations:
      o.translations && typeof o.translations === "object"
        ? (o.translations as CmsWebsiteSettings["translations"])
        : base.translations,
  };
}
