import Link from "next/link";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { publicSpaceUrlSegment } from "@/lib/cms2/slug";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2SpacesList({ org, basePath }: { org: PublicOrgPayload; basePath: string }) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const p = basePath;
  const label = (st: string) =>
    st === "meeting_room" ? "Meeting room" : st === "hot_desk" ? "Hot desk" : st === "desk" ? "Desk" : st;

  return (
    <Cms2SiteChrome org={org} basePath={basePath}>
      <section style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 22px 56px" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: "1.75rem", color: t.petrolDark }}>Spaces</h1>
        <p style={{ margin: "0 0 28px", color: t.muted }}>Browse bookable meeting rooms and desks. Offices and venues — enquire via Contact.</p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 20,
          }}
        >
          {org.spaces.map((s) => (
            <article
              key={s.id}
              style={{
                background: t.surface,
                borderRadius: 14,
                border: `1px solid ${t.border}`,
                padding: 22,
                boxShadow: "0 4px 20px rgba(13, 61, 59, 0.05)",
              }}
            >
              <h2 style={{ margin: "0 0 8px", fontSize: "1.1rem", color: t.petrol }}>{s.name}</h2>
              <p style={{ margin: 0, fontSize: 14, color: t.muted }}>
                {label(s.spaceType)} · {s.capacity} people · {s.propertyName}
              </p>
              {org.settings.showPrices ? (
                <p style={{ margin: "14px 0 0", fontWeight: 700, color: t.petrolDark }}>€{Number(s.hourlyPrice).toFixed(0)} / hour</p>
              ) : (
                <p style={{ margin: "14px 0 0", fontWeight: 600, color: t.muted }}>Price on request</p>
              )}
              <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 10 }}>
                <Link
                  href={`${p}/spaces/${publicSpaceUrlSegment(s)}`}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    background: t.petrol,
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  Book now
                </Link>
                {(s.spaceType === "office" || s.spaceType === "venue") && (
                  <Link href={`${p}/contact`} style={{ padding: "8px 14px", color: t.teal, fontWeight: 600, fontSize: 14 }}>
                    Enquire
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
        {org.spaces.length === 0 ? <p style={{ color: t.muted }}>No spaces available.</p> : null}
      </section>
    </Cms2SiteChrome>
  );
}
