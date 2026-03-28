"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppNav from "@/components/AppNav";
import LeadChatbotWidget from "@/components/LeadChatbotWidget";
import VoiceAssistantWidget from "@/components/VoiceAssistantWidget";
import { DEFAULT_BRAND } from "@/lib/brand/default";
import { isReservedOrgSlug } from "@/lib/cms2/reserved-slugs";

function isPublicMarketingPath(pathname: string | null): boolean {
  if (pathname === "/") return true;
  // When pathname is not ready yet, treat as app shell (keeps sidebar visible on /super-admin etc.).
  if (!pathname) return false;
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
      <div style={{ minHeight: "100vh", display: "flex", background: "var(--warm-white, #faf9f6)" }}>
        <AppNav />
        <main
          className="vw-main-shell"
          style={{
            flex: 1,
            minWidth: 0,
            padding: "72px 16px 24px 16px",
            fontFamily: DEFAULT_BRAND.font_family ?? undefined,
            background: "var(--warm-white, #faf9f6)",
            color: "var(--petrol, #1a4a4a)",
          }}
        >
          {children}
        </main>
      </div>
      <style>{`
        .vw-main-shell {
          color: var(--petrol, #1a4a4a);
        }
        .vw-card {
          background: #fff;
          border-radius: 14px;
          border: 1px solid rgba(26, 74, 74, 0.1);
          box-shadow: 0 4px 22px rgba(26, 74, 74, 0.07);
        }
        .vw-btn-primary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 18px;
          border-radius: 10px;
          border: none;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          background: var(--petrol, #1a4a4a);
          color: #fff;
          box-shadow: 0 2px 8px rgba(26, 74, 74, 0.2);
        }
        .vw-btn-primary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .vw-btn-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 10px 18px;
          border-radius: 10px;
          border: 1px solid rgba(58, 175, 169, 0.45);
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          background: #fff;
          color: var(--teal, #3aafa9);
        }
        .vw-input {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(26, 74, 74, 0.18);
          font-size: 14px;
          background: #fff;
          color: var(--petrol, #1a4a4a);
        }
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
