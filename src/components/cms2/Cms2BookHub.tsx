import Link from "next/link";
import type { CmsMarketingLocale } from "@/lib/cms2/marketing-locales";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import type { CmsPublicUi } from "@/lib/cms2/public-ui";
import { tx } from "@/lib/cms2/public-ui";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2BookHub({
  org,
  basePath,
  locale,
  ui,
}: {
  org: PublicOrgPayload;
  basePath: string;
  locale: CmsMarketingLocale;
  ui: CmsPublicUi;
}) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const p = basePath;

  return (
    <Cms2SiteChrome org={org} basePath={basePath} locale={locale} ui={ui}>
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "36px 22px 56px" }}>
        <h1 style={{ margin: "0 0 12px", color: t.petrolDark }}>{tx(ui, "book.title")}</h1>
        <p style={{ color: t.muted, marginTop: 0 }}>{tx(ui, "book.lead")}</p>
        <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0", display: "grid", gap: 12 }}>
          <li>
            <Link
              href={`${p}/spaces`}
              style={{
                display: "block",
                padding: 16,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                background: t.surface,
                textDecoration: "none",
                color: t.text,
                fontWeight: 600,
              }}
            >
              {tx(ui, "book.browseAll")}
            </Link>
          </li>
          <li>
            <Link
              href="/book/meeting-rooms"
              style={{
                display: "block",
                padding: 16,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                background: t.surface,
                textDecoration: "none",
                color: t.text,
                fontWeight: 600,
              }}
            >
              {tx(ui, "book.legacyMr")}
            </Link>
          </li>
          <li>
            <Link
              href="/book/coworking"
              style={{
                display: "block",
                padding: 16,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                background: t.surface,
                textDecoration: "none",
                color: t.text,
                fontWeight: 600,
              }}
            >
              {tx(ui, "book.coworking")}
            </Link>
          </li>
          <li>
            <Link
              href="/book/venues"
              style={{
                display: "block",
                padding: 16,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                background: t.surface,
                textDecoration: "none",
                color: t.text,
                fontWeight: 600,
              }}
            >
              {tx(ui, "book.venues")}
            </Link>
          </li>
        </ul>
        <p style={{ marginTop: 28, fontSize: 14, color: t.muted }}>
          {tx(ui, "book.footerLead")}{" "}
          <Link href={`${p}/contact`}>{tx(ui, "nav.contact")}</Link> {tx(ui, "book.footerTail")}
        </p>
      </section>
    </Cms2SiteChrome>
  );
}
