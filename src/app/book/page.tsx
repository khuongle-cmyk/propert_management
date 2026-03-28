import { Cms2BookHub } from "@/components/cms2/Cms2BookHub";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";

export async function generateMetadata() {
  const org = await getRootMarketingOrgCached();
  return { title: `Book · ${org.brandName}` };
}

export default async function RootBookPage() {
  const org = await getRootMarketingOrgCached();
  return <Cms2BookHub org={org} basePath="" />;
}
