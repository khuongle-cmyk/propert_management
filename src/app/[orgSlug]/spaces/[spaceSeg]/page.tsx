import { notFound } from "next/navigation";
import { Cms2SpaceDetailClient } from "@/components/cms2/Cms2SpaceDetailClient";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { buildCmsMarketingLanguageAlternates } from "@/lib/cms2/marketing-alternates";
import { parseSpaceIdFromSegment } from "@/lib/cms2/slug";

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string; spaceSeg: string }> }) {
  const { orgSlug, spaceSeg } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) return { title: "Not found" };
  const id = parseSpaceIdFromSegment(decodeURIComponent(spaceSeg));
  const space = id ? org.spaces.find((s) => s.id === id) : undefined;
  const path = `/${orgSlug}/spaces/${encodeURIComponent(spaceSeg)}`;
  return {
    title: space ? `${space.name} · ${org.brandName}` : `${org.brandName} · Space`,
    alternates: {
      languages: buildCmsMarketingLanguageAlternates(path),
    },
  };
}

export default async function OrgSpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; spaceSeg: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { orgSlug, spaceSeg } = await params;
  const sp = await searchParams;
  const raw = await getOrgPublicSiteCached(orgSlug);
  if (!raw) notFound();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  const id = parseSpaceIdFromSegment(decodeURIComponent(spaceSeg));
  if (!id) notFound();
  const space = org.spaces.find((s) => s.id === id);
  if (!space) notFound();
  return <Cms2SpaceDetailClient org={org} basePath={`/${orgSlug}`} space={space} locale={locale} ui={ui} />;
}
