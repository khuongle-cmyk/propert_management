import { notFound } from "next/navigation";
import { Cms2SpaceDetailClient } from "@/components/cms2/Cms2SpaceDetailClient";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { parseSpaceIdFromSegment } from "@/lib/cms2/slug";

export default async function OrgSpaceDetailPage({
  params,
}: {
  params: Promise<{ orgSlug: string; spaceSeg: string }>;
}) {
  const { orgSlug, spaceSeg } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  const id = parseSpaceIdFromSegment(decodeURIComponent(spaceSeg));
  if (!id) notFound();
  const space = org.spaces.find((s) => s.id === id);
  if (!space) notFound();
  return <Cms2SpaceDetailClient org={org} basePath={`/${orgSlug}`} space={space} />;
}
