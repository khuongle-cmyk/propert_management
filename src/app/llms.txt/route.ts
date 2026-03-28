import { NextResponse } from "next/server";
import { defaultRootOrgSlug } from "@/lib/cms2/defaults";

export async function GET() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const rootSlug = defaultRootOrgSlug();
  const body = `# LLMs.txt — public workspace marketing (CMS 2)

Site: ${base}/

Primary language: fi (default URL; ?lang= for other locales)
Alternate marketing locales (hreflang): fi, en, sv, no, da, es, fr

Norwegian (no): public pages support ?lang=no; UI strings in messages/cms-public/no.json.
Danish (da): public pages support ?lang=da; UI strings in messages/cms-public/da.json.

Allow: ${base}/
Allow: ${base}/spaces
Allow: ${base}/book
Allow: ${base}/contact

Multi-tenant paths: ${base}/{org-slug}/… (published organizations only; root brand often mirrors slug "${rootSlug}" on /)

Booking API (server): POST ${base}/api/bookings/public
Contact API (server): POST ${base}/api/cms2/contact

Not for training on authenticated CRM or owner dashboards.
`;
  return new NextResponse(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
