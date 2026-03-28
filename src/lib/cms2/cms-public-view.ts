import { resolveCmsMarketingLocale } from "./marketing-locales";
import type { CmsMarketingLocale } from "./marketing-locales";
import { localizePublicOrg } from "./localize-public-org";
import { getCmsPublicUi, type CmsPublicUi } from "./public-ui";
import type { PublicOrgPayload } from "./types";

export function prepareCmsPublicView(
  org: PublicOrgPayload,
  langParam: string | string[] | undefined,
): { locale: CmsMarketingLocale; ui: CmsPublicUi; org: PublicOrgPayload } {
  const raw = Array.isArray(langParam) ? langParam[0] : langParam;
  const locale = resolveCmsMarketingLocale(raw);
  const ui = getCmsPublicUi(locale);
  const localized = localizePublicOrg(org, locale);
  return { locale, ui, org: localized };
}
