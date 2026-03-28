import { notFound } from "next/navigation";
import { Cms2SpaceDetailClient } from "@/components/cms2/Cms2SpaceDetailClient";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { parseSpaceIdFromSegment } from "@/lib/cms2/slug";

export default async function RootSpaceDetailPage({ params }: { params: Promise<{ spaceSeg: string }> }) {
  const { spaceSeg } = await params;
  const id = parseSpaceIdFromSegment(decodeURIComponent(spaceSeg));
  if (!id) notFound();
  const org = await getRootMarketingOrgCached();
  const space = org.spaces.find((s) => s.id === id);
  if (!space) notFound();
  return <Cms2SpaceDetailClient org={org} basePath="" space={space} />;
}
