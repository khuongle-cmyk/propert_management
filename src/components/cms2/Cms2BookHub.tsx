import Link from "next/link";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2BookHub({ org, basePath }: { org: PublicOrgPayload; basePath: string }) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const p = basePath;

  return (
    <Cms2SiteChrome org={org} basePath={basePath}>
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "36px 22px 56px" }}>
        <h1 style={{ margin: "0 0 12px", color: t.petrolDark }}>Book</h1>
        <p style={{ color: t.muted, marginTop: 0 }}>
          Choose a flow below. Meeting rooms can also be booked from each space page with live availability.
        </p>
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
              Browse all spaces →
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
              Legacy meeting room booking (property link)
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
              Coworking / hot desks
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
              Venues
            </Link>
          </li>
        </ul>
        <p style={{ marginTop: 28, fontSize: 14, color: t.muted }}>
          For offices and custom deals, use <Link href={`${p}/contact`}>Contact</Link> — we create a CRM lead and send an auto-reply.
        </p>
      </section>
    </Cms2SiteChrome>
  );
}
