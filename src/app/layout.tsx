import type { Metadata } from "next";
import type { ReactNode } from "react";
import BrandProvider from "@/components/BrandProvider";
import ConditionalWorkspaceChrome from "@/components/ConditionalWorkspaceChrome";
import { DEFAULT_BRAND } from "@/lib/brand/default";

export const metadata: Metadata = {
  title: "Workspace Platform",
  description: "White-label workspace management platform",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        style={{
          fontFamily: DEFAULT_BRAND.font_family ?? undefined,
          margin: 0,
          background: "#faf9f6",
          color: "var(--brand-text)",
        }}
      >
        <BrandProvider>
          <ConditionalWorkspaceChrome>{children}</ConditionalWorkspaceChrome>
          <style>{`
            html {
              background: #faf9f6;
            }
            :root {
              --brand-primary: ${DEFAULT_BRAND.primary_color};
              --brand-secondary: ${DEFAULT_BRAND.secondary_color};
              --brand-sidebar: ${DEFAULT_BRAND.sidebar_color};
              --brand-background: #faf9f6;
              --brand-text: ${DEFAULT_BRAND.text_color};
              --brand-accent: ${DEFAULT_BRAND.accent_color};
              --brand-logo: "${DEFAULT_BRAND.logo_url ?? ""}";
            }
          `}</style>
        </BrandProvider>
      </body>
    </html>
  );
}

