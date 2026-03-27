"use client";

import Link from "next/link";

export default function SettingsPage() {
  return (
    <main style={{ display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Settings</h1>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Data import</h2>
        <p style={{ color: "#64748b" }}>Import 2+ years of historical revenue, costs, invoices, and occupancy for complete reporting baseline.</p>
        <Link href="/settings/import">Open historical data import</Link>
      </section>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Branding</h2>
        <p style={{ color: "#64748b" }}>Manage your white-label brand settings and preview login/email style.</p>
        <Link href="/settings/brand">Open brand settings</Link>
      </section>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Billing</h2>
        <p style={{ color: "#64748b" }}>Review what your tenant owes, calculate monthly charges, and send manual invoices.</p>
        <Link href="/settings/billing">Open tenant billing</Link>
      </section>
    </main>
  );
}
