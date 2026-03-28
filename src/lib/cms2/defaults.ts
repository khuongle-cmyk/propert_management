import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";
import type { CmsFooterLink, CmsGalleryItem, CmsWebsiteSettings } from "./types";

function parseFooterLinks(raw: unknown, fallback: CmsFooterLink[]): CmsFooterLink[] {
  if (!Array.isArray(raw)) return fallback;
  const out: CmsFooterLink[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    if (typeof o.label !== "string" || typeof o.href !== "string") continue;
    out.push({ label: o.label.trim(), href: o.href.trim() });
  }
  return out.length ? out : fallback;
}

export const VILLAGEWORKS_DEFAULT_CMS_SETTINGS: CmsWebsiteSettings = {
  headline: "Workspace that works|for your business",
  subheadline:
    "Flexible offices, meeting rooms, and venues — book online or talk to our team. One platform for landlords and tenants.",
  heroEyebrow: "● Helsinki · Professional Workspaces",
  heroStatsLine: "5 Locations · 90%+ Occupancy · 500+ Companies",
  heroImageUrl: null,
  contactEmail: "info@villageworks.com",
  contactSalesEmail: "sales@villageworks.com",
  contactPhone: "+358 10 271 0670",
  contactAddress: null,
  showPrices: true,
  testimonials: [
    {
      quote:
        "VillageWorksin tilat ovat edustavia, ja uusi Erottajan kohde on upea! Henkilökunta on mukavaa ja palvelualtista.",
      author: "Essi",
      role: "Lenovo",
    },
    {
      quote: "Kolmen henkilön porukkamme on viihtynyt erinomaisesti",
      author: "Kaija",
      role: "Media Audit Finland",
    },
    {
      quote: "Villageworks has offered us a comfortable, functional, and clean workspace.",
      author: "Danielle",
      role: "FiberOne Oy",
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
  footerCompanyLinks: [
    { label: "About us", href: "https://villageworks.com/meista/" },
    { label: "Careers", href: "https://www.linkedin.com/company/villageworkshq/jobs/" },
    { label: "Blog", href: "https://villageworks.com/uutiset/" },
    { label: "Privacy policy", href: "https://villageworks.com/tietosuojaseloste/" },
    { label: "Terms of use", href: "https://villageworks.com/kayttoehdot/" },
  ],
  footerSocialLinks: [
    { label: "Instagram", href: "https://www.instagram.com/villageworkshq/" },
    { label: "LinkedIn", href: "https://www.linkedin.com/company/villageworkshq/" },
    { label: "Facebook", href: "https://www.facebook.com/VillageWorksHQ" },
  ],
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
    heroEyebrow: typeof o.heroEyebrow === "string" ? o.heroEyebrow : o.heroEyebrow === null ? null : base.heroEyebrow,
    heroStatsLine: typeof o.heroStatsLine === "string" ? o.heroStatsLine : o.heroStatsLine === null ? null : base.heroStatsLine,
    heroImageUrl: typeof o.heroImageUrl === "string" ? o.heroImageUrl : o.heroImageUrl === null ? null : base.heroImageUrl,
    contactEmail: typeof o.contactEmail === "string" ? o.contactEmail : base.contactEmail,
    contactSalesEmail:
      typeof o.contactSalesEmail === "string"
        ? o.contactSalesEmail
        : o.contactSalesEmail === null
          ? null
          : base.contactSalesEmail,
    contactPhone: typeof o.contactPhone === "string" ? o.contactPhone : base.contactPhone,
    contactAddress: typeof o.contactAddress === "string" ? o.contactAddress : base.contactAddress,
    showPrices: typeof o.showPrices === "boolean" ? o.showPrices : base.showPrices,
    testimonials: Array.isArray(o.testimonials) ? (o.testimonials as CmsWebsiteSettings["testimonials"]) : base.testimonials,
    gallery: Array.isArray(o.gallery) ? (o.gallery as CmsGalleryItem[]) : base.gallery,
    faq: Array.isArray(o.faq) ? (o.faq as CmsWebsiteSettings["faq"]) : base.faq,
    publicSpaceIds: Array.isArray(o.publicSpaceIds) ? (o.publicSpaceIds as string[]) : o.publicSpaceIds === null ? null : base.publicSpaceIds,
    pipelineSlug: typeof o.pipelineSlug === "string" ? o.pipelineSlug : o.pipelineSlug === null ? null : base.pipelineSlug,
    seoDescription: typeof o.seoDescription === "string" ? o.seoDescription : base.seoDescription,
    footerCompanyLinks: parseFooterLinks(o.footerCompanyLinks, base.footerCompanyLinks),
    footerSocialLinks: parseFooterLinks(o.footerSocialLinks, base.footerSocialLinks),
    translations:
      o.translations && typeof o.translations === "object"
        ? (o.translations as CmsWebsiteSettings["translations"])
        : base.translations,
  };
}
