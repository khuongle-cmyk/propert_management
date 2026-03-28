import { Cms2Home } from "@/components/cms2/Cms2Home";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { buildLocalBusinessJsonLd } from "@/lib/cms2/seo";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) return { title: "Not found" };
  return {
    title: org.brandName,
    description: org.settings.seoDescription ?? `${org.brandName} — workspaces and meeting rooms.`,
    alternates: {
      languages: {
        en: `/${orgSlug}`,
        fi: `/${orgSlug}?lang=fi`,
        sv: `/${orgSlug}?lang=sv`,
        es: `/${orgSlug}?lang=es`,
        fr: `/${orgSlug}?lang=fr`,
      },
    },
  };
}

export default async function OrgHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  const jsonLd = buildLocalBusinessJsonLd(org, `/${orgSlug}`);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Cms2Home org={org} basePath={`/${orgSlug}`} />
    </>
  );
}
