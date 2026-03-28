"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import type { CmsPublicSpace, PublicOrgPayload } from "@/lib/cms2/types";
import { themeFromBrand } from "@/lib/cms2/types";
import { Cms2SiteChrome } from "./Cms2SiteChrome";

export function Cms2SpaceDetailClient({
  org,
  basePath,
  space,
}: {
  org: PublicOrgPayload;
  basePath: string;
  space: CmsPublicSpace;
}) {
  const t = themeFromBrand(org.primaryColor, org.secondaryColor);
  const p = basePath;
  const isOfficeLike = space.spaceType === "office";
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");
  const [company, setCompany] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const minDate = useMemo(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }, []);

  async function onBook(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (!org.tenantId) {
      setErr("Booking is not configured for this demo site yet.");
      return;
    }
    if (!startLocal || !endLocal || !visitorName.trim() || !visitorEmail.trim()) {
      setErr("Please fill all required fields.");
      return;
    }
    const startAt = new Date(startLocal).toISOString();
    const endAt = new Date(endLocal).toISOString();
    setSaving(true);
    try {
      const res = await fetch("/api/bookings/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: space.propertyId,
          spaceId: space.id,
          startAt,
          endAt,
          visitorName: visitorName.trim(),
          visitorEmail: visitorEmail.trim(),
          purpose: company.trim() ? `Company: ${company.trim()}` : null,
          attendeeCount: 1,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? "Booking failed");
        return;
      }
      setMsg("Booking confirmed — check your email for details.");
      setStartLocal("");
      setEndLocal("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Cms2SiteChrome org={org} basePath={basePath}>
      <section style={{ maxWidth: 720, margin: "0 auto", padding: "36px 22px 56px" }}>
        <Link href={`${p}/spaces`} style={{ color: t.teal, fontSize: 14 }}>
          ← All spaces
        </Link>
        <h1 style={{ margin: "16px 0 8px", color: t.petrolDark }}>{space.name}</h1>
        <p style={{ color: t.muted, marginTop: 0 }}>
          {space.propertyName} · {space.spaceType.replace(/_/g, " ")}
        </p>
        {org.settings.showPrices ? (
          <p style={{ fontWeight: 700, color: t.petrolDark }}>€{Number(space.hourlyPrice).toFixed(0)} / hour</p>
        ) : null}

        {isOfficeLike ? (
          <div style={{ marginTop: 24, padding: 20, background: t.surface, borderRadius: 14, border: `1px solid ${t.border}` }}>
            <p>For offices and long-term space, send an enquiry and we&apos;ll create a lead in CRM.</p>
            <Link
              href={`${p}/contact`}
              style={{
                display: "inline-block",
                marginTop: 12,
                padding: "10px 18px",
                background: t.petrol,
                color: "#fff",
                borderRadius: 10,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Enquire
            </Link>
          </div>
        ) : (
          <form onSubmit={(e) => void onBook(e)} style={{ marginTop: 24, display: "grid", gap: 14 }}>
            <h2 style={{ fontSize: "1.1rem", color: t.petrolDark, margin: 0 }}>Availability</h2>
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              Start
              <input
                type="datetime-local"
                value={startLocal}
                min={minDate}
                onChange={(e) => setStartLocal(e.target.value)}
                required
                style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
              />
            </label>
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              End
              <input
                type="datetime-local"
                value={endLocal}
                min={startLocal || minDate}
                onChange={(e) => setEndLocal(e.target.value)}
                required
                style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
              />
            </label>
            <h2 style={{ fontSize: "1.1rem", color: t.petrolDark, margin: "8px 0 0" }}>Your details</h2>
            <input
              placeholder="Full name"
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value)}
              required
              style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
            />
            <input
              type="email"
              placeholder="Email"
              value={visitorEmail}
              onChange={(e) => setVisitorEmail(e.target.value)}
              required
              style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
            />
            <input
              placeholder="Company (optional)"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: `1px solid ${t.border}` }}
            />
            {err ? <p style={{ color: "#b91c1c", margin: 0 }}>{err}</p> : null}
            {msg ? <p style={{ color: t.petrol, margin: 0 }}>{msg}</p> : null}
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                border: "none",
                background: t.petrol,
                color: "#fff",
                fontWeight: 600,
                cursor: saving ? "wait" : "pointer",
              }}
            >
              {saving ? "Booking…" : "Confirm booking"}
            </button>
          </form>
        )}
      </section>
    </Cms2SiteChrome>
  );
}
