"use client";

import type { BrandSettings } from "@/lib/brand/types";

export default function BrandLivePreview({ brand }: { brand: BrandSettings }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Live preview</h3>

      <div style={{ border: "1px solid #dfe8e8", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 160 }}>
          <aside style={{ background: brand.sidebar_color, color: "#fff", padding: 12 }}>
            <img src={brand.logo_white_url ?? brand.logo_url ?? ""} alt={brand.brand_name} style={{ maxWidth: 150, width: "100%" }} />
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.9 }}>Sidebar</div>
          </aside>
          <main style={{ background: brand.background_color, padding: 12 }}>
            <div style={{ background: "#fff", border: `1px solid ${brand.accent_color}`, borderRadius: 12, padding: 10 }}>
              <div style={{ fontWeight: 600, color: brand.text_color }}>Sample dashboard card</div>
              <div style={{ color: "#5f7676", fontSize: 13 }}>Revenue / occupancy visual style</div>
            </div>
          </main>
        </div>
      </div>

      <div style={{ border: "1px solid #dfe8e8", borderRadius: 12, background: "#fff", padding: 12 }}>
        <div style={{ color: "#667d7d", fontSize: 12 }}>Sample email</div>
        <img src={brand.email_logo_url ?? brand.logo_url ?? ""} alt={brand.brand_name} style={{ maxHeight: 34, margin: "8px 0" }} />
        <div style={{ color: brand.text_color }}>Subject: Welcome to {brand.brand_name}</div>
        <div style={{ color: "#5f7676", fontSize: 13, marginTop: 6 }}>
          Footer: {brand.email_footer_text ?? "Thank you"}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #dfe8e8",
          borderRadius: 12,
          overflow: "hidden",
          backgroundImage: brand.login_page_background_image_url ? `url(${brand.login_page_background_image_url})` : undefined,
          backgroundSize: "cover",
        }}
      >
        <div style={{ background: "rgba(255,255,255,0.92)", padding: 12 }}>
          <img src={brand.logo_url ?? ""} alt={brand.brand_name} style={{ maxHeight: 36 }} />
          <div style={{ fontWeight: 600, marginTop: 8 }}>{brand.login_page_headline ?? `Welcome to ${brand.brand_name}`}</div>
          <div style={{ fontSize: 13, color: "#5f7676" }}>
            {brand.login_page_subheadline ?? "Sign in to continue."}
          </div>
        </div>
      </div>
    </section>
  );
}

