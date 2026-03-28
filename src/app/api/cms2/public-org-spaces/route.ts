import { NextResponse } from "next/server";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";

/**
 * Debug: same spaces list as the public homepage (from get-public-org, not a separate SQL path).
 * GET /api/cms2/public-org-spaces — no auth (marketing data). Remove or protect if you expose production.
 */
export async function GET() {
  const org = await getRootMarketingOrgCached();
  return NextResponse.json({
    note: "Homepage uses src/lib/cms2/get-public-org.ts loadOrgFromDb() with Supabase service role — there is no separate /api call for SSR pages.",
    tenantId: org.tenantId,
    slug: org.slug,
    published: org.published,
    propertiesCount: org.properties.length,
    spacesCount: org.spaces.length,
    spaces: org.spaces,
    publicSpaceIdsSetting: org.settings.publicSpaceIds ?? null,
  });
}
