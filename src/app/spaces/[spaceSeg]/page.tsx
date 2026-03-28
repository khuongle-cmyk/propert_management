import { notFound } from "next/navigation";
import { Cms2SpaceDetailClient } from "@/components/cms2/Cms2SpaceDetailClient";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { buildCmsMarketingLanguageAlternates } from "@/lib/cms2/marketing-alternates";
import { parseSpaceIdFromSegment } from "@/lib/cms2/slug";

export async function generateMetadata({ params }: { params: Promise<{ spaceSeg: string }> }) {
  const { spaceSeg } = await params;
  const org = await getRootMarketingOrgCached();
  const id = parseSpaceIdFromSegment(decodeURIComponent(spaceSeg));
  const space = id ? org.spaces.find((s) => s.id === id) : undefined;
  const path = `/spaces/${encodeURIComponent(spaceSeg)}`;
  return {
    title: space ? `${space.name} · ${org.brandName}` : `${org.brandName} · Space`,
    alternates: {
      languages: buildCmsMarketingLanguageAlternates(path),
    },
  };
}

export default async function RootSpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceSeg: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { spaceSeg } = await params;
  const sp = await searchParams;
  const id = parseSpaceIdFromSegment(decodeURIComponent(spaceSeg));
  if (!id) notFound();
  const raw = await getRootMarketingOrgCached();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  const space = org.spaces.find((s) => s.id === id);
  if (!space) notFound();
  return <Cms2SpaceDetailClient org={org} basePath="" space={space} locale={locale} ui={ui} />;
}
