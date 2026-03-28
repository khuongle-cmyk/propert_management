import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";

export default async function RootPortalPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = await getRootMarketingOrgCached();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath="" locale={locale} ui={ui}>
      <div style={{ display: "grid", gap: 12, color: t.muted }}>
        <p>Overview of your workspace relationship — contracts, bookings, and tickets will appear here as we wire tenant-scoped data.</p>
        <p>
          <strong style={{ color: t.text }}>Room bookings:</strong> use{" "}
          <a href="/bookings/my" style={{ color: t.teal }}>
            /bookings/my
          </a>{" "}
          in the main app today.
        </p>
      </div>
    </Cms2PortalShell>
  );
}
