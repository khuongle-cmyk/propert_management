import { Cms2Home } from "@/components/cms2/Cms2Home";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { buildLocalBusinessJsonLd } from "@/lib/cms2/seo";

export async function generateMetadata() {
  const org = await getRootMarketingOrgCached();
  return {
    title: org.brandName,
    description: org.settings.seoDescription ?? `${org.brandName} — workspaces and meeting rooms.`,
    alternates: {
      languages: {
        en: "/",
        fi: "/?lang=fi",
        sv: "/?lang=sv",
        es: "/?lang=es",
        fr: "/?lang=fr",
      },
    },
  };
}

export default async function HomePage() {
  const org = await getRootMarketingOrgCached();
  const jsonLd = buildLocalBusinessJsonLd(org, "/");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Cms2Home org={org} basePath="" />
    </>
  );
}
