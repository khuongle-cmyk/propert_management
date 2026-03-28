import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";

export default async function RootPortalMaintenancePage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = await getRootMarketingOrgCached();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath="" locale={locale} ui={ui}>
      <p style={{ color: t.muted }}>Maintenance tickets will be created and tracked here.</p>
    </Cms2PortalShell>
  );
}
