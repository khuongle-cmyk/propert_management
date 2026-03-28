import { Cms2BookHub } from "@/components/cms2/Cms2BookHub";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { notFound } from "next/navigation";

export default async function OrgBookPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  return <Cms2BookHub org={org} basePath={`/${orgSlug}`} />;
}
