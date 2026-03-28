import Link from "next/link";
import type { CmsMarketingLocale } from "@/lib/cms2/marketing-locales";
import type { CmsTheme } from "@/lib/cms2/types";
import type { CmsPublicUi } from "@/lib/cms2/public-ui";
import { tx } from "@/lib/cms2/public-ui";
import type { PublicPropertyGroup, SpaceTypeBucket } from "@/lib/spaces/public-browse";
import { SPACE_TYPE_BUCKETS, publicPageQuery } from "@/lib/spaces/public-browse";

function bucketTxKey(b: SpaceTypeBucket): string {
  return `propertyBucket.${b}`;
}

export function Cms2PropertyCards({
  theme,
  basePath,
  ui,
  locale,
  groups,
  maxProperties,
  showViewAllLink,
  titleKey = "home.ourLocations",
  descKey = "home.ourLocationsDesc",
}: {
  theme: CmsTheme;
  basePath: string;
  ui: CmsPublicUi;
  locale: CmsMarketingLocale;
  groups: PublicPropertyGroup[];
  maxProperties?: number;
  showViewAllLink?: boolean;
  titleKey?: string;
  descKey?: string;
}) {
  const p = basePath;
  const slice = maxProperties != null ? groups.slice(0, maxProperties) : groups;
  const lang = locale;

  return (
    <>
      <h2 style={{ margin: "0 0 8px", fontSize: "1.35rem", color: theme.petrolDark }}>{tx(ui, titleKey)}</h2>
      <p style={{ margin: "0 0 28px", color: theme.muted, fontSize: "0.95rem" }}>{tx(ui, descKey)}</p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))",
          gap: 22,
        }}
      >
        {slice.map((g) => (
          <article
            key={g.propertyId}
            style={{
              background: theme.surface,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              overflow: "hidden",
              boxShadow: "0 8px 28px rgba(13, 61, 59, 0.08)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: theme.bg }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={g.cardImageUrl}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
            <div style={{ padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: "1.2rem", color: theme.petrol }}>{g.propertyName}</h3>
              {g.addressLine ? (
                <p style={{ margin: 0, fontSize: "0.95rem", color: theme.muted, lineHeight: 1.45 }}>{g.addressLine}</p>
              ) : null}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SPACE_TYPE_BUCKETS.filter((b) => g.counts[b] > 0).map((b) => (
                  <Link
                    key={b}
                    href={`${p}/spaces/${encodeURIComponent(g.slug)}${publicPageQuery({ lang, type: b })}`}
                    scroll={false}
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      padding: "6px 10px",
                      borderRadius: 999,
                      background: theme.accentBg,
                      color: theme.petrol,
                      border: `1px solid ${theme.border}`,
                      textDecoration: "none",
                    }}
                  >
                    {tx(ui, bucketTxKey(b))} {g.counts[b]}
                  </Link>
                ))}
              </div>
              <div style={{ marginTop: "auto", paddingTop: 8 }}>
                <Link
                  href={`${p}/spaces/${encodeURIComponent(g.slug)}${publicPageQuery({ lang })}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontWeight: 600,
                    fontSize: 15,
                    color: theme.teal,
                    textDecoration: "none",
                  }}
                >
                  {tx(ui, "spaces.viewSpaces")}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      {showViewAllLink && groups.length > (maxProperties ?? 0) ? (
        <div style={{ marginTop: 28 }}>
          <Link
            href={`${p}/spaces${publicPageQuery({ lang })}`}
            style={{
              display: "inline-flex",
              fontWeight: 600,
              fontSize: 15,
              color: theme.teal,
              textDecoration: "none",
            }}
          >
            {tx(ui, "spaces.viewAllLocations")}
          </Link>
        </div>
      ) : null}
    </>
  );
}
