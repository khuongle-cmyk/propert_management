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

/** UI: emoji flag + endonym for dropdown (nav trigger shows current flag only). */
export const languages: Array<{
  code: CmsMarketingLocale;
  flag: string;
  /** Language name in that language (e.g. Suomi, English). */
  name: string;
}> = [
  { code: "fi", flag: "🇫🇮", name: "Suomi" },
  { code: "en", flag: "🇬🇧", name: "English" },
  { code: "sv", flag: "🇸🇪", name: "Svenska" },
  { code: "no", flag: "🇳🇴", name: "Norsk" },
  { code: "da", flag: "🇩🇰", name: "Dansk" },
  { code: "es", flag: "🇪🇸", name: "Español" },
  { code: "fr", flag: "🇫🇷", name: "Français" },
];

/** Locales passed to auto-translate (all marketing languages). */
export const CMS_TRANSLATION_TARGET_LOCALES = [...CMS_MARKETING_LOCALES] as const;
