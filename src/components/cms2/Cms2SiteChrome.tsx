import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { Cms2HeaderClient } from "./Cms2HeaderClient";

export function Cms2SiteChrome({
  org,
  basePath,
  children,
}: {
  org: PublicOrgPayload;
  basePath: string;
  children: ReactNode;
}) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const prefix = basePath || "";
  const nav = [
    { href: prefix ? `${prefix}/` : "/", label: "Home" },
    { href: `${prefix}/spaces`, label: "Spaces" },
    { href: `${prefix}/book`, label: "Book" },
    { href: `${prefix}/contact`, label: "Contact" },
    { href: `${prefix}/portal`, label: "Tenant portal" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: t.bg, color: t.text, fontFamily: VILLAGEWORKS_FONT }}>
      <div style={{ height: 4, background: `linear-gradient(90deg, ${t.petrol}, ${t.teal})` }} />
      <Cms2HeaderClient org={org} theme={t} nav={nav} basePath={prefix} />
      {children}
      <footer style={{ background: t.petrolDark, color: "#b8d4d2", padding: "40px 22px", marginTop: 48 }}>
        <div
          style={{
            maxWidth: 1120,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: 28,
            fontSize: 14,
          }}
        >
          <div>
            <strong style={{ color: "#fff", display: "block", marginBottom: 10 }}>Contact</strong>
            {org.settings.contactEmail ? (
              <a href={`mailto:${org.settings.contactEmail}`} style={{ color: "#e8f4f3" }}>
                {org.settings.contactEmail}
              </a>
            ) : (
              <span>—</span>
            )}
            {org.settings.contactPhone ? (
              <div style={{ marginTop: 8 }}>
                <a href={`tel:${org.settings.contactPhone}`} style={{ color: "#e8f4f3" }}>
                  {org.settings.contactPhone}
                </a>
              </div>
            ) : null}
          </div>
          <div>
            <strong style={{ color: "#fff", display: "block", marginBottom: 10 }}>Explore</strong>
            {nav.slice(0, 4).map((item) => (
              <div key={item.href} style={{ marginBottom: 6 }}>
                <Link href={item.href} style={{ color: "#e8f4f3", textDecoration: "none" }}>
                  {item.label}
                </Link>
              </div>
            ))}
          </div>
          <div>
            <strong style={{ color: "#fff", display: "block", marginBottom: 10 }}>Brand</strong>
            <span style={{ opacity: 0.9 }}>{org.brandName}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

const VILLAGEWORKS_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export function Cms2Hero({
  org,
  theme,
}: {
  org: PublicOrgPayload;
  theme: ReturnType<typeof themeFromBrand>;
}) {
  return (
    <section
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "48px 22px 56px",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
        gap: 40,
        alignItems: "center",
      }}
      className="cms2-hero-grid"
    >
      <div>
        <h1
          style={{
            margin: "0 0 16px",
            fontSize: "clamp(2rem, 4vw, 2.65rem)",
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1.15,
            color: theme.petrolDark,
          }}
        >
          {org.settings.headline}
        </h1>
        <p style={{ margin: "0 0 24px", fontSize: "1.08rem", color: theme.muted, maxWidth: 520 }}>{org.settings.subheadline}</p>
      </div>
      <div
        style={{
          borderRadius: 14,
          background: theme.surface,
          boxShadow: "0 12px 40px rgba(13, 61, 59, 0.08)",
          border: `1px solid ${theme.border}`,
          overflow: "hidden",
          minHeight: 280,
        }}
      >
        <div style={{ position: "relative", height: 220, background: `linear-gradient(160deg, ${theme.accentBg}, #d4efec)` }}>
          {org.settings.heroImageUrl ? (
            <Image src={org.settings.heroImageUrl} alt="" fill style={{ objectFit: "cover" }} sizes="(max-width:900px) 100vw, 480px" unoptimized />
          ) : null}
        </div>
        <div style={{ padding: "16px 18px", fontSize: 14, color: theme.muted }}>Hero image — set in CMS (upload or AI).</div>
      </div>
      <style>{`
        @media (max-width: 900px) {
          .cms2-hero-grid { grid-template-columns: 1fr !important; padding-top: 28px !important; }
        }
      `}</style>
    </section>
  );
}
