import { Cms2BookHub } from "@/components/cms2/Cms2BookHub";
import { prepareCmsPublicView } from "@/lib/cms2/cms-public-view";
import { getRootMarketingOrgCached } from "@/lib/cms2/get-public-org";
import { buildCmsMarketingLanguageAlternates } from "@/lib/cms2/marketing-alternates";

export async function generateMetadata() {
  const org = await getRootMarketingOrgCached();
  return {
    title: `Book · ${org.brandName}`,
    alternates: {
      languages: buildCmsMarketingLanguageAlternates("/book"),
    },
  };
}

export default async function RootBookPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const sp = await searchParams;
  const raw = await getRootMarketingOrgCached();
  const { locale, ui, org } = prepareCmsPublicView(raw, sp.lang);
  return <Cms2BookHub org={org} basePath="" locale={locale} ui={ui} />;
}
