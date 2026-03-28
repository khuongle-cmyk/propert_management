import { Cms2ContactClient } from "@/components/cms2/Cms2ContactClient";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { defaultRootOrgSlug } from "@/lib/cms2/defaults";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { buildCmsMarketingLanguageAlternates } from "@/lib/cms2/marketing-alternates";

export async function generateMetadata() {
  const org = await getRootMarketingOrgCached();
  return {
    title: `Contact · ${org.brandName}`,
    alternates: {
      languages: buildCmsMarketingLanguageAlternates("/contact"),
    },
  };
}

export default async function RootContactPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = await getRootMarketingOrgCached();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  return <Cms2ContactClient org={org} basePath="" orgSlug={defaultRootOrgSlug()} locale={locale} ui={ui} />;
}
