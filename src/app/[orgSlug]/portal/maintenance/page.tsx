import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";
import { notFound } from "next/navigation";

export default async function OrgPortalMaintenancePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath={`/${orgSlug}`}>
      <p style={{ color: t.muted }}>Maintenance tickets — coming soon.</p>
    </Cms2PortalShell>
  );
}
