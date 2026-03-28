import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";

export default async function RootPortalInvoicesPage() {
  const org = await getRootMarketingOrgCached();
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath="">
      <p style={{ color: t.muted }}>Invoices and online pay links will appear here (billing module).</p>
    </Cms2PortalShell>
  );
}
