import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getOrgPublicSiteCached } from "@/lib/cms2/get-public-org";
import { isReservedOrgSlug } from "@/lib/cms2/reserved-slugs";

export default async function OrgPublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  if (isReservedOrgSlug(orgSlug)) notFound();
  const org = await getOrgPublicSiteCached(orgSlug);
  if (!org) notFound();
  return <>{children}</>;
}
