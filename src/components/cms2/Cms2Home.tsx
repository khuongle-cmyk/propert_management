import Link from "next/link";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { publicSpaceUrlSegment } from "@/lib/cms2/slug";
import { Cms2Hero, Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2Home({ org, basePath }: { org: PublicOrgPayload; basePath: string }) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const p = basePath;
  const spaceTypeLabel = (st: string) =>
    st === "meeting_room" ? "Meeting room" : st === "hot_desk" ? "Hot desk" : st === "desk" ? "Desk" : st;

  return (
    <Cms2SiteChrome org={org} basePath={basePath}>
      <Cms2Hero org={org} theme={t} />
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "8px 22px 24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <Link
            href={`${p}/spaces`}
            style={{
              display: "inline-flex",
              padding: "10px 18px",
              borderRadius: 10,
              fontWeight: 600,
              background: t.petrol,
              color: "#fff",
              textDecoration: "none",
              boxShadow: "0 4px 14px rgba(26, 92, 90, 0.35)",
            }}
          >
            Browse spaces
          </Link>
          <Link
            href={`${p}/contact`}
            style={{
              display: "inline-flex",
              padding: "10px 18px",
              borderRadius: 10,
              fontWeight: 600,
              background: t.surface,
              color: t.petrol,
              border: `1px solid ${t.border}`,
              textDecoration: "none",
            }}
          >
            Enquire
          </Link>
        </div>
      </section>
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 22px 56px" }}>
        <h2 style={{ margin: "0 0 8px", fontSize: "1.35rem", color: t.petrolDark }}>Available spaces</h2>
        <p style={{ margin: "0 0 28px", color: t.muted, fontSize: "0.95rem" }}>
          Meeting rooms, desks, and more — book online or send an enquiry for offices and venues.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: 18,
          }}
        >
          {org.spaces.slice(0, 9).map((s) => (
            <article
              key={s.id}
              style={{
                background: t.surface,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                padding: 20,
                boxShadow: "0 4px 20px rgba(13, 61, 59, 0.04)",
              }}
            >
              <h3 style={{ margin: "0 0 8px", fontSize: "1.05rem", color: t.petrol }}>{s.name}</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: t.muted }}>
                {spaceTypeLabel(s.spaceType)} · {s.propertyName}
              </p>
              {org.settings.showPrices ? (
                <div style={{ marginTop: 12, fontWeight: 700, color: t.petrolDark, fontSize: "0.95rem" }}>
                  From €{Number(s.hourlyPrice).toFixed(0)} / hour
                </div>
              ) : (
                <div style={{ marginTop: 12, fontWeight: 600, color: t.muted, fontSize: "0.9rem" }}>Price on request</div>
              )}
              <div style={{ marginTop: 14 }}>
                <Link
                  href={`${p}/spaces/${publicSpaceUrlSegment(s)}`}
                  style={{ color: t.teal, fontWeight: 600, fontSize: 14, textDecoration: "none" }}
                >
                  View & book →
                </Link>
              </div>
            </article>
          ))}
        </div>
        {org.spaces.length === 0 ? (
          <p style={{ color: t.muted }}>No bookable spaces are published yet. Check back soon or contact us.</p>
        ) : null}
      </section>
      {org.settings.testimonials.length ? (
        <section style={{ maxWidth: 1120, margin: "0 auto", padding: "0 22px 48px" }}>
          <h2 style={{ fontSize: "1.35rem", color: t.petrolDark }}>What tenants say</h2>
          <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
            {org.settings.testimonials.map((x, i) => (
              <blockquote
                key={i}
                style={{
                  margin: 0,
                  padding: 20,
                  background: t.surface,
                  borderRadius: 14,
                  border: `1px solid ${t.border}`,
                  fontSize: "0.95rem",
                  color: t.text,
                }}
              >
                <p style={{ margin: "0 0 8px" }}>&ldquo;{x.quote}&rdquo;</p>
                <footer style={{ color: t.muted, fontSize: 14 }}>
                  — {x.author}
                  {x.role ? `, ${x.role}` : ""}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      ) : null}
    </Cms2SiteChrome>
  );
}
