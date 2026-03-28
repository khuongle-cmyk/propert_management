import { Cms2SpacesList } from "@/components/cms2/Cms2SpacesList";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";

export async function generateMetadata() {
  const org = await getRootMarketingOrgCached();
  return { title: `Spaces · ${org.brandName}` };
}

export default async function RootSpacesPage() {
  const org = await getRootMarketingOrgCached();
  return <Cms2SpacesList org={org} basePath="" />;
}
