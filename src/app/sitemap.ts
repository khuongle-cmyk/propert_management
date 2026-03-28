import type { MetadataRoute } from "next";
import { defaultRootOrgSlug } from "@/lib/cms2/defaults";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();

  const rootPaths = ["", "/spaces", "/book", "/contact", "/portal"];
  const out: MetadataRoute.Sitemap = rootPaths.map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.8,
  }));

  let slugs: string[] = [];
  try {
    const admin = getSupabaseAdminClient();
    const { data } = await admin.from("tenant_public_website").select("slug").eq("published", true);
    slugs = (data ?? []).map((r) => r.slug as string);
  } catch {
    /* table missing or no service key */
  }

  const rootSlug = defaultRootOrgSlug();
  for (const slug of slugs) {
    if (slug.toLowerCase() === rootSlug) continue;
    for (const sub of ["", "/spaces", "/book", "/contact", "/portal"]) {
      out.push({
        url: `${base}/${slug}${sub}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: sub === "" ? 0.9 : 0.7,
      });
    }
  }

  return out;
}
