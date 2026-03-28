import type { Metadata } from "next";
import { CMS_MARKETING_LOCALES } from "./marketing-locales";

/**
 * Build Next.js `alternates.languages` for hreflang.
 * Finnish (`fi`) uses the clean path; other locales append `?lang=xx`.
 * `path` is pathname only (e.g. `/`, `/spaces`, `/acme/contact`).
 */
export function buildCmsMarketingLanguageAlternates(path: string): NonNullable<Metadata["alternates"]>["languages"] {
  const base = path === "" ? "/" : path.startsWith("/") ? path : `/${path}`;
  const out: Record<string, string> = {};
  for (const lang of CMS_MARKETING_LOCALES) {
    if (lang === "fi") {
      out[lang] = base;
    } else {
      const sep = base.includes("?") ? "&" : "?";
      out[lang] = `${base}${sep}lang=${lang}`;
    }
  }
  out["x-default"] = base;
  return out;
}
