/** Public marketing site locales (query: ?lang=). Finnish is the default when `lang` is omitted. */

export const CMS_MARKETING_LOCALES = ["fi", "en", "sv", "no", "da", "es", "fr"] as const;
export type CmsMarketingLocale = (typeof CMS_MARKETING_LOCALES)[number];

export const DEFAULT_CMS_MARKETING_LOCALE: CmsMarketingLocale = "fi";

const LOCALE_SET = new Set<string>(CMS_MARKETING_LOCALES);

/** Norwegian Bokmål / Nynorsk codes map to `no` for hreflang. */
export function resolveCmsMarketingLocale(raw: string | undefined | null): CmsMarketingLocale {
  const x = (raw ?? "").trim().toLowerCase();
  if (x === "nb" || x === "nn" || x === "no") return "no";
  if (x.length >= 2 && LOCALE_SET.has(x.slice(0, 2))) return x.slice(0, 2) as CmsMarketingLocale;
  return DEFAULT_CMS_MARKETING_LOCALE;
}

/** UI: flag-icons (`fi fi-xx`) + endonym; `flagIconSuffix` is the `fi-xx` country code (`en` → `gb`). */
export const languages: Array<{
  code: CmsMarketingLocale;
  /** Second part of flag-icons class, e.g. `fi fi-gb` → `gb`. */
  flagIconSuffix: string;
  /** Language name in that language (e.g. Suomi, English). */
  name: string;
}> = [
  { code: "fi", flagIconSuffix: "fi", name: "Suomi" },
  { code: "en", flagIconSuffix: "gb", name: "English" },
  { code: "sv", flagIconSuffix: "se", name: "Svenska" },
  { code: "no", flagIconSuffix: "no", name: "Norsk" },
  { code: "da", flagIconSuffix: "dk", name: "Dansk" },
  { code: "es", flagIconSuffix: "es", name: "Español" },
  { code: "fr", flagIconSuffix: "fr", name: "Français" },
];

/** Locales passed to auto-translate (all marketing languages). */
export const CMS_TRANSLATION_TARGET_LOCALES = [...CMS_MARKETING_LOCALES] as const;
