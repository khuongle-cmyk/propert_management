import { Cms2ContactClient } from "@/components/cms2/Cms2ContactClient";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { notFound } from "next/navigation";

export default async function OrgContactPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  return <Cms2ContactClient org={org} basePath={`/${orgSlug}`} orgSlug={orgSlug} />;
}
