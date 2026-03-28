import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";
import { notFound } from "next/navigation";

export default async function OrgPortalPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath={`/${orgSlug}`}>
      <div style={{ display: "grid", gap: 12, color: t.muted }}>
        <p>Tenant portal for {org.brandName}. Deep links to contracts, community events, and tickets will land here.</p>
      </div>
    </Cms2PortalShell>
  );
}
