"use client";

import { useState, type FormEvent } from "react";
import type { PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2ContactClient({
  org,
  basePath,
  orgSlug,
}: {
  org: PublicOrgPayload;
  basePath: string;
  /** null for root marketing site */
  orgSlug: string | null;
}) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
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
      setResult(data.error ?? "Failed to send");
      return;
    }
    setResult("Thanks! Your enquiry was received. We sent a confirmation email.");
    setForm({ name: "", email: "", phone: "", company: "", interestedSpaceType: "office", message: "" });
  }

  return (
    <Cms2SiteChrome org={org} basePath={basePath}>
      <section style={{ maxWidth: 640, margin: "0 auto", padding: "36px 22px 56px" }}>
        <h1 style={{ margin: "0 0 8px", color: t.petrolDark }}>Contact</h1>
        <p style={{ margin: "0 0 20px", color: t.muted }}>Tell us what you need — we&apos;ll create a lead in CRM and reply shortly.</p>
        <form onSubmit={(e) => void onSubmit(e)} style={{ display: "grid", gap: 12 }}>
          <input
            required
            placeholder="Your name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <input
            placeholder="Phone"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <input
            placeholder="Company"
            value={form.company}
            onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          />
          <select
            value={form.interestedSpaceType}
            onChange={(e) => setForm((f) => ({ ...f, interestedSpaceType: e.target.value }))}
            style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
          >
            <option value="office">Office</option>
            <option value="meeting_room">Meeting room</option>
            <option value="venue">Venue</option>
            <option value="hot_desk">Hot desk</option>
          </select>
          <textarea
            placeholder="Message"
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
            {loading ? "Sending…" : "Send enquiry"}
          </button>
          {result ? <p style={{ color: result.startsWith("Thanks") ? t.petrol : "#b91c1c" }}>{result}</p> : null}
        </form>
      </section>
    </Cms2SiteChrome>
  );
}
