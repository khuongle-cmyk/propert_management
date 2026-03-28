import type { CmsMarketingLocale } from "./marketing-locales";
import type { PublicOrgPayload } from "./types";

/** Merge CMS `settings.translations[locale]` into headline / subheadline / SEO fields. */
export function localizePublicOrg(org: PublicOrgPayload, locale: CmsMarketingLocale): PublicOrgPayload {
  const tr = org.settings.translations?.[locale];
  if (!tr) return org;
  return {
    ...org,
    settings: {
      ...org.settings,
      headline: tr.headline ?? org.settings.headline,
      subheadline: tr.subheadline ?? org.settings.subheadline,
      seoDescription: tr.seoDescription ?? org.settings.seoDescription,
    },
  };
}
