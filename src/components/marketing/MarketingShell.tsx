"use client";

import type { ReactNode } from "react";
import { MarketingTenantProvider, useMarketingTenant } from "@/contexts/MarketingTenantContext";
import MarketingNav from "@/components/marketing/MarketingNav";

function Inner({ children }: { children: ReactNode }) {
  const { loading, error, tenantId, tenants, isSuperAdmin, dataReady, setTenantId } = useMarketingTenant();

  if (loading) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24, backgroundColor: "#F8F5F0", minHeight: "100%" }}>
        <p style={{ fontSize: 14, color: "#5a6b68" }}>Loading marketing…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24, backgroundColor: "#F8F5F0", minHeight: "100%" }}>
        <p style={{ fontSize: 14, color: "#b42318" }}>{error}</p>
      </div>
    );
  }

  const orgSelectValue = (isSuperAdmin || tenants.length > 1) && tenantId === "" ? "all" : tenantId;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24, backgroundColor: "#F8F5F0", minHeight: "100%" }}>
      <div
        style={{
          marginBottom: 24,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "1.75rem",
            fontFamily: "'Instrument Serif', Georgia, serif",
            color: "#21524F",
            fontWeight: 600,
          }}
        >
          Marketing
        </h1>
        {isSuperAdmin || tenants.length > 1 ? (
          <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14, color: "#5a6b68" }}>
            <span>Organization</span>
            <select
              value={orgSelectValue}
              onChange={(e) => {
                const v = e.target.value;
                setTenantId(v === "all" ? "" : v);
              }}
              style={{
                border: "1px solid rgba(33,82,79,0.2)",
                borderRadius: 10,
                padding: "8px 12px",
                backgroundColor: "#fff",
                color: "#1a2e2a",
                minWidth: 200,
                fontSize: 14,
                fontFamily: "'DM Sans', sans-serif",
                outline: "none",
              }}
            >
              {isSuperAdmin || tenants.length > 1 ? <option value="all">All organizations</option> : null}
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <MarketingNav />

      {!dataReady ? (
        <p style={{ fontSize: 14, color: "#5a6b68" }}>Select an organization to continue.</p>
      ) : (
        children
      )}
    </div>
  );
}

export default function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <MarketingTenantProvider>
      <Inner>{children}</Inner>
    </MarketingTenantProvider>
  );
}
