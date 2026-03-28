"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppNav from "@/components/AppNav";
import LeadChatbotWidget from "@/components/LeadChatbotWidget";
import VoiceAssistantWidget from "@/components/VoiceAssistantWidget";
import { DEFAULT_BRAND } from "@/lib/brand/default";
import { isReservedOrgSlug } from "@/lib/cms2/reserved-slugs";

function isPublicMarketingPath(pathname: string | null): boolean {
  if (!pathname || pathname === "/") return true;
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return false;
  if (isReservedOrgSlug(seg)) return false;
  return true;
}

export default function ConditionalWorkspaceChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const publicSite = isPublicMarketingPath(pathname);

  if (publicSite) {
    return (
      <>
        {children}
        <LeadChatbotWidget />
        <VoiceAssistantWidget />
      </>
    );
  }

  return (
    <>
      <div style={{ minHeight: "100vh", display: "flex" }}>
        <AppNav />
        <main
          className="vw-main-shell"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "72px 16px 24px 16px",
            fontFamily: DEFAULT_BRAND.font_family ?? undefined,
          }}
        >
          {children}
        </main>
      </div>
      <style>{`
        @media (min-width: 961px) {
          .vw-main-shell {
            padding: 24px 24px 28px 24px !important;
          }
        }
      `}</style>
      <LeadChatbotWidget />
      <VoiceAssistantWidget />
    </>
  );
}
