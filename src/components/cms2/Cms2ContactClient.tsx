"use client";

import { useState, type FormEvent } from "react";
import type { CmsMarketingLocale } from "@/lib/cms2/marketing-locales";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import type { CmsPublicUi } from "@/lib/cms2/public-ui";
import { tx } from "@/lib/cms2/public-ui";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2ContactClient({
  org,
  basePath,
  orgSlug,
  locale,
  ui,
}: {
  org: PublicOrgPayload;
  basePath: string;
  /** null for root marketing site */
  orgSlug: string | null;
  locale: CmsMarketingLocale;
  ui: CmsPublicUi;
}) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultOk, setResultOk] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    interestedSpaceType: "office",
    message: "",
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setResultOk(false);
    const res = await fetch("/api/cms2/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgSlug: orgSlug ?? undefined,
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        interestedSpaceType: form.interestedSpaceType,
        message: form.message,
      }),
    });
    const data = (await res.json()) as { error?: string };
    setLoading(false);
    if (!res.ok) {
      setResult(data.error ?? tx(ui, "contact.error"));
      setResultOk(false);
      return;
    }
    setResult(tx(ui, "contact.success"));
    setResultOk(true);
    setForm({ name: "", email: "", phone: "", company: "", interestedSpaceType: "office", message: "" });
  }

  return (
    <Cms2SiteChrome org={org} basePath={basePath} locale={locale} ui={ui}>
      <section style={{ maxWidth: 640, margin: "0 auto", padding: "36px 22px 56px" }}>
        <h1 style={{ margin: "0 0 8px", color: t.petrolDark }}>{tx(ui, "contact.title")}</h1>
        <p style={{ margin: "0 0 20px", color: t.muted }}>{tx(ui, "contact.lead")}</p>
        <div
          style={{
            marginBottom: 24,
            padding: 18,
            borderRadius: 12,
            background: t.surface,
            border: `1px solid ${t.border}`,
            fontSize: 14,
            color: t.text,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: t.petrolDark, display: "block", marginBottom: 10 }}>{tx(ui, "contact.reachUs")}</strong>
          {org.settings.contactEmail ? (
            <div style={{ marginBottom: 6 }}>
              {tx(ui, "footer.email")}:{" "}
              <a href={`mailto:${org.settings.contactEmail}`} style={{ color: t.teal, fontWeight: 600 }}>
                {org.settings.contactEmail}
              </a>
            </div>
          ) : null}
          {org.settings.contactSalesEmail ? (
            <div style={{ marginBottom: 6 }}>
              {tx(ui, "footer.sales")}:{" "}
              <a href={`mailto:${org.settings.contactSalesEmail}`} style={{ color: t.teal, fontWeight: 600 }}>
                {org.settings.contactSalesEmail}
              </a>
            </div>
          ) : null}
          {org.settings.contactPhone ? (
            <div>
              {tx(ui, "footer.phone")}:{" "}
              <a
                href={`tel:${org.settings.contactPhone.replace(/[\s()-]/g, "")}`}
                style={{ color: t.teal, fontWeight: 600 }}
              >
                {org.settings.contactPhone}
              </a>
            </div>
          ) : null}
        </div>
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <input
            required
            placeholder={tx(ui, "contact.name")}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <input
            required
            type="email"
            placeholder={tx(ui, "contact.email")}
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <input
            placeholder={tx(ui, "contact.phone")}
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <input
            placeholder={tx(ui, "contact.company")}
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <select
            value={form.interestedSpaceType}
            onChange={(e) => setForm((f) => ({ ...f, interestedSpaceType: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          >
            <option value="office">{tx(ui, "contact.option.office")}</option>
            <option value="meeting_room">{tx(ui, "contact.option.meeting_room")}</option>
            <option value="venue">{tx(ui, "contact.option.venue")}</option>
            <option value="hot_desk">{tx(ui, "contact.option.hot_desk")}</option>
          </select>
          <textarea
            placeholder={tx(ui, "contact.message")}
            rows={5}
            value={form.message}
            onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "12px 18px",
              borderRadius: 10,
              border: "none",
              background: t.petrol,
              color: "#fff",
              fontWeight: 600,
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? tx(ui, "contact.sending") : tx(ui, "contact.send")}
          </button>
          {result ? <p style={{ color: resultOk ? t.petrol : "#b91c1c" }}>{result}</p> : null}
        </form>
      </section>
    </Cms2SiteChrome>
  );
}
