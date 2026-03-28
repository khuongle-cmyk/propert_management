import { Cms2SpacesList } from "@/components/cms2/Cms2SpacesList";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) return { title: "Not found" };
  return { title: `Spaces · ${org.brandName}` };
}

export default async function OrgSpacesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  return <Cms2SpacesList org={org} basePath={`/${orgSlug}`} />;
}
