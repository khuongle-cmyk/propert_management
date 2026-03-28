"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { CmsMarketingLocale } from "@/lib/cms2/marketing-locales";
import { getSupabaseClient } from "@/lib/supabase/browser";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import type { CmsPublicUi } from "@/lib/cms2/public-ui";
import { tx } from "@/lib/cms2/public-ui";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2PortalShell({
  org,
  basePath,
  locale,
  ui,
  children,
}: {
  org: PublicOrgPayload;
  basePath: string;
  locale: CmsMarketingLocale;
  ui: CmsPublicUi;
  children: ReactNode;
}) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(`${basePath}/portal`)}`);
        return;
      }
      setEmail(user.email ?? null);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, basePath]);

  if (!ready) {
    return (
      <Cms2SiteChrome org={org} basePath={basePath} locale={locale} ui={ui}>
        <p style={{ padding: 48, textAlign: "center", color: t.muted }}>{tx(ui, "portal.checkingSession")}</p>
      </Cms2SiteChrome>
    );
  }

  const p = basePath;
  const sub = [
    { href: `${p}/portal`, label: tx(ui, "portal.nav.overview") },
    { href: `${p}/portal/bookings`, label: tx(ui, "portal.nav.bookings") },
    { href: `${p}/portal/invoices`, label: tx(ui, "portal.nav.invoices") },
    { href: `${p}/portal/maintenance`, label: tx(ui, "portal.nav.maintenance") },
  ];

  return (
    <Cms2SiteChrome org={org} basePath={basePath} locale={locale} ui={ui}>
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "28px 22px 56px" }}>
        <p style={{ margin: "0 0 8px", color: t.muted, fontSize: 14 }}>
          {tx(ui, "portal.signedInAs")} {email}
        </p>
        <h1 style={{ margin: "0 0 20px", color: t.petrolDark }}>{tx(ui, "portal.title")}</h1>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
          {sub.map((x) => (
            <Link
              key={x.href}
              href={x.href}
              style={{
                padding: "8px 14px",
                borderRadius: 10,
                background: t.surface,
                border: `1px solid ${t.border}`,
                color: t.petrol,
                fontWeight: 600,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              {x.label}
            </Link>
          ))}
          <Link href="/bookings/my" style={{ padding: "8px 14px", color: t.teal, fontSize: 14 }}>
            {tx(ui, "portal.openFullApp")}
          </Link>
        </nav>
        {children}
      </section>
    </Cms2SiteChrome>
  );
}
