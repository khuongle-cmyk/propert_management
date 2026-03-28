import { Cms2ContactClient } from "@/components/cms2/Cms2ContactClient";
import { defaultRootOrgSlug } from "@/lib/cms2/defaults";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";

export async function generateMetadata() {
  const org = await getRootMarketingOrgCached();
  return { title: `Contact · ${org.brandName}` };
}

export default async function RootContactPage() {
  const org = await getRootMarketingOrgCached();
  return <Cms2ContactClient org={org} basePath="" orgSlug={defaultRootOrgSlug()} />;
}
