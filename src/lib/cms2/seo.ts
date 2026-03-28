import type { PublicOrgPayload } from "./types";

export function buildLocalBusinessJsonLd(org: PublicOrgPayload, urlPath: string) {
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const url = `${origin.replace(/\/$/, "")}${urlPath === "" ? "/" : urlPath}`;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: org.brandName,
    url,
    image: org.settings.heroImageUrl ?? org.logoUrl ?? undefined,
    email: org.settings.contactEmail ?? undefined,
    telephone: org.settings.contactPhone ?? undefined,
    address: org.settings.contactAddress
      ? {
          "@type": "PostalAddress",
          streetAddress: org.settings.contactAddress,
        }
      : undefined,
  };
}
