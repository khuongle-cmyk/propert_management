import { notFound } from "next/navigation";
import { Cms2PropertyDetail } from "@/components/cms2/Cms2PropertyDetail";
import { Cms2SpaceDetailClient } from "@/components/cms2/Cms2SpaceDetailClient";
import { Cms2SiteChrome } from "@/components/cms2/Cms2SiteChrome";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { buildCmsMarketingLanguageAlternates } from "@/lib/cms2/marketing-alternates";
import { parseSpaceIdFromSegment } from "@/lib/cms2/slug";
import { themeFromBrand } from "@/lib/cms2/types";
import { apiRowToCmsPublicSpace, fetchPublicSpacesFromApi } from "@/lib/spaces/public-api";
import { findPropertyGroupBySlug, groupPublicSpacesByProperty, parseTypeFilter } from "@/lib/spaces/public-browse";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string; spaceSeg: string }>;
}) {
  const { orgSlug, spaceSeg } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) return { title: "Not found" };
  const decoded = decodeURIComponent(spaceSeg);
  const path = `/${orgSlug}/spaces/${encodeURIComponent(spaceSeg)}`;
  const apiSpaces = await fetchPublicSpacesFromApi();
  const groups = groupPublicSpacesByProperty(apiSpaces);
  const id = parseSpaceIdFromSegment(decoded);
  if (id) {
    const row = apiSpaces.find((s) => s.id === id);
    const space = row ? apiRowToCmsPublicSpace(row) : org.spaces.find((s) => s.id === id);
    return {
      title: space ? `${space.name} · ${org.brandName}` : `${org.brandName} · Space`,
      alternates: { languages: buildCmsMarketingLanguageAlternates(path) },
    };
  }
  const prop = findPropertyGroupBySlug(groups, decoded);
  if (prop) {
    return {
      title: `${prop.propertyName} · ${org.brandName}`,
      alternates: { languages: buildCmsMarketingLanguageAlternates(path) },
    };
  }
  return {
    title: `${org.brandName} · Space`,
    alternates: { languages: buildCmsMarketingLanguageAlternates(path) },
  };
}

export default async function OrgSpaceSegmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; spaceSeg: string }>;
  searchParams: Promise<{ lang?: string; type?: string }>;
}) {
  const { orgSlug, spaceSeg } = await params;
  const sp = await searchParams;
  const raw = await getOrgPublicSiteCached(orgSlug);
  if (!raw) notFound();

  const decoded = decodeURIComponent(spaceSeg);
  const apiSpaces = await fetchPublicSpacesFromApi();
  const groups = groupPublicSpacesByProperty(apiSpaces);
  const id = parseSpaceIdFromSegment(decoded);

  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const basePath = `/${orgSlug}`;

  if (id) {
    const row = apiSpaces.find((s) => s.id === id);
    const space = row ? apiRowToCmsPublicSpace(row) : org.spaces.find((s) => s.id === id);
    if (!space) notFound();
    return <Cms2SpaceDetailClient org={org} basePath={basePath} space={space} locale={locale} ui={ui} />;
  }

  const prop = findPropertyGroupBySlug(groups, decoded);
  if (prop) {
    const typeFilter = parseTypeFilter(sp.type);
    return (
      <Cms2SiteChrome org={org} basePath={basePath} locale={locale} ui={ui}>
        <Cms2PropertyDetail org={org} theme={t} basePath={basePath} locale={locale} ui={ui} group={prop} typeFilter={typeFilter} />
      </Cms2SiteChrome>
    );
  }

  notFound();
}
