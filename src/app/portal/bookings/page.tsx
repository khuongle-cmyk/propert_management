import { Cms2PortalShell } from "@/components/cms2/Cms2PortalShell";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { themeFromBrand } from "@/lib/cms2/types";
import Link from "next/link";

export default async function RootPortalBookingsPage() {
  const org = await getRootMarketingOrgCached();
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  return (
    <Cms2PortalShell org={org} basePath="">
      <p style={{ color: t.muted }}>Booking history for your tenant account will list here. For now:</p>
      <Link href="/bookings/my" style={{ color: t.teal, fontWeight: 600 }}>
        Go to My bookings
      </Link>
    </Cms2PortalShell>
  );
}
