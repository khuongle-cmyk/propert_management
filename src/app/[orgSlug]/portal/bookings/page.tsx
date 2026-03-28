import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function OrgPortalBookingsPage({
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
      <Link href="/bookings/my" style={{ color: t.teal, fontWeight: 600 }}>
        My bookings (app)
      </Link>
    </Cms2PortalShell>
  );
}
