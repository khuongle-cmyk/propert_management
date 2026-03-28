import type { CmsMarketingLocale } from "./marketing-locales";
import { DEFAULT_CMS_MARKETING_LOCALE } from "./marketing-locales";
import da from "@/messages/cms-public/da.json";
import en from "@/messages/cms-public/en.json";
import es from "@/messages/cms-public/es.json";
import fi from "@/messages/cms-public/fi.json";
import fr from "@/messages/cms-public/fr.json";
import no from "@/messages/cms-public/no.json";
import sv from "@/messages/cms-public/sv.json";

export type CmsPublicUi = Record<string, string>;

const DICTS: Record<CmsMarketingLocale, CmsPublicUi> = {
  fi: fi as CmsPublicUi,
  en: en as CmsPublicUi,
  sv: sv as CmsPublicUi,
  no: no as CmsPublicUi,
  da: da as CmsPublicUi,
  es: es as CmsPublicUi,
  fr: fr as CmsPublicUi,
};

/** UI strings for public CMS pages; merges with English for any missing key. */
export function getCmsPublicUi(locale: CmsMarketingLocale): CmsPublicUi {
  const primary = DICTS[locale] ?? DICTS[DEFAULT_CMS_MARKETING_LOCALE];
  return { ...(en as CmsPublicUi), ...primary };
}

/** English bundle for lookups when `ui` is missing (never crash on undefined). */
const EN_UI = en as CmsPublicUi;

export function tx(ui: CmsPublicUi | null | undefined, key: string): string {
  if (!ui) {
    const v = EN_UI[key];
    return v !== undefined && v !== "" ? v : key;
  }
  const v = ui[key];
  return v !== undefined && v !== "" ? v : key;
}

/** Safe UI dict for public pages when props omit `ui` (e.g. partial renders). */
export function resolveCmsPublicUi(ui: CmsPublicUi | null | undefined, locale: CmsMarketingLocale): CmsPublicUi {
  if (ui) return ui;
  return getCmsPublicUi(locale);
}
