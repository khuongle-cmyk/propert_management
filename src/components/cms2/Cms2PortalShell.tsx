"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2PortalShell({
  org,
  basePath,
  children,
}: {
  org: PublicOrgPayload;
  basePath: string;
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
      <Cms2SiteChrome org={org} basePath={basePath}>
        <p style={{ padding: 48, textAlign: "center", color: t.muted }}>Checking session…</p>
      </Cms2SiteChrome>
    );
  }

  const p = basePath;
  const sub = [
    { href: `${p}/portal`, label: "Overview" },
    { href: `${p}/portal/bookings`, label: "My bookings" },
    { href: `${p}/portal/invoices`, label: "Invoices" },
    { href: `${p}/portal/maintenance`, label: "Maintenance" },
  ];

  return (
    <Cms2SiteChrome org={org} basePath={basePath}>
      <section style={{ maxWidth: 960, margin: "0 auto", padding: "28px 22px 56px" }}>
        <p style={{ margin: "0 0 8px", color: t.muted, fontSize: 14 }}>Signed in as {email}</p>
        <h1 style={{ margin: "0 0 20px", color: t.petrolDark }}>Tenant portal</h1>
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
            Open full app →
          </Link>
        </nav>
        {children}
      </section>
    </Cms2SiteChrome>
  );
}
