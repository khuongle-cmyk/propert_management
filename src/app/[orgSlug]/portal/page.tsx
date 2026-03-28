import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";
import { notFound } from "next/navigation";

export default async function OrgPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const raw = await getOrgPublicSiteCached(orgSlug);
  if (!raw) notFound();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath={`/${orgSlug}`} locale={locale} ui={ui}>
      <div style={{ display: "grid", gap: 12, color: t.muted }}>
        <p>Tenant portal for {org.brandName}. Deep links to contracts, community events, and tickets will land here.</p>
      </div>
    </Cms2PortalShell>
  );
}
