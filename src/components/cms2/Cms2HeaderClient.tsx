"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense, useState } from "react";
import type { CmsMarketingLocale } from "@/lib/cms2/marketing-locales";
import type { CmsPublicUi } from "@/lib/cms2/public-ui";
import { tx } from "@/lib/cms2/public-ui";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import type { CmsTheme } from "@/lib/cms2/types";
import { Cms2LanguageSwitcher } from "./Cms2LanguageSwitcher";

export function Cms2HeaderClient({
  org,
  theme,
  nav,
  basePath,
  locale,
  ui,
}: {
  org: PublicOrgPayload;
  theme: CmsTheme;
  nav: { href: string; label: string }[];
  basePath: string;
  locale: CmsMarketingLocale;
  ui: CmsPublicUi;
}) {
  const [open, setOpen] = useState(false);
  const loginRedirect = `${basePath || ""}/portal`;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(250, 249, 246, 0.85)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: `1px solid ${theme.border}`,
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: 1120,
          margin: "0 auto",
          padding: "14px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <Link
          href={basePath ? `${basePath}/` : "/"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 700,
            fontSize: "1.05rem",
            color: theme.petrol,
            textDecoration: "none",
            letterSpacing: "-0.02em",
          }}
        >
          {org.logoUrl ? (
            <Image
              src={org.logoUrl}
              alt=""
              width={200}
              height={50}
              style={{ width: "auto", height: "40px" }}
              unoptimized
            />
          ) : (
            <>
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: `linear-gradient(135deg, ${theme.petrol}, ${theme.teal})`,
                }}
              />
              {org.brandName}
            </>
          )}
        </Link>
        <nav className={`cms2-nav-main ${open ? "cms2-nav-main-open" : ""}`}>
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              style={{
                color: theme.muted,
                textDecoration: "none",
                fontSize: "0.92rem",
                fontWeight: 500,
                padding: "8px 12px",
                borderRadius: 10,
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Suspense fallback={null}>
            <Cms2LanguageSwitcher theme={theme} currentLocale={locale} ui={ui} />
          </Suspense>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            style={{
              display: "none",
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: theme.surface,
              cursor: "pointer",
            }}
            className="cms2-nav-toggle"
            aria-label={tx(ui, "header.menu")}
          >
            {tx(ui, "header.menu")}
          </button>
          <Link
            href={`/login?redirect=${encodeURIComponent(loginRedirect || "/portal")}`}
            style={{
              display: "inline-flex",
              padding: "10px 18px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "0.92rem",
              textDecoration: "none",
              background: theme.surface,
              color: theme.petrol,
              border: `1px solid ${theme.border}`,
            }}
          >
            {tx(ui, "header.login")}
          </Link>
          <Link
            href={`${basePath}/book`}
            style={{
              display: "inline-flex",
              padding: "10px 18px",
              borderRadius: 10,
              fontWeight: 600,
              fontSize: "0.92rem",
              textDecoration: "none",
              background: theme.petrol,
              color: "#fff",
              boxShadow: "0 4px 14px rgba(26, 92, 90, 0.35)",
            }}
          >
            {tx(ui, "header.bookRoom")}
          </Link>
        </div>
      </div>
      <style>{`
        .cms2-nav-main {
          display: none;
          position: absolute;
          left: 0;
          right: 0;
          top: 100%;
          flex-direction: column;
          background: rgba(250, 249, 246, 0.96);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid ${theme.border};
          padding: 12px;
          gap: 4px;
          box-shadow: 0 12px 24px rgba(0,0,0,0.08);
        }
        .cms2-nav-main-open { display: flex; }
        @media (min-width: 901px) {
          .cms2-nav-main {
            display: flex !important;
            position: static !important;
            flex-direction: row !important;
            align-items: center;
            flex-wrap: wrap;
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .cms2-nav-toggle { display: none !important; }
        }
        @media (max-width: 900px) {
          .cms2-nav-toggle { display: inline-flex !important; }
        }
        .cms2-nav-main a:hover {
          background: ${theme.accentBg};
          color: ${theme.petrol};
        }
      `}</style>
    </header>
  );
}
