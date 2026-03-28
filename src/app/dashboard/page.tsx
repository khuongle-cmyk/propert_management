"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { VILLAGEWORKS_BRAND } from "@/lib/brand/villageworks";

type PropertyRow = {
  id: string;
  tenant_id: string | null;
  name: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  total_units: number | null;
  occupied_units: number | null;
  status: string | null;
};

type MembershipRow = {
  tenant_id: string | null;
  role: string;
};

type TenantRow = { id: string; name: string };
type PipelineSettingsRow = {
  tenant_id: string;
  enabled: boolean;
  contact_slug: string | null;
  inbound_email: string | null;
  custom_stages: string[] | null;
  auto_assign_rules: Record<string, unknown> | null;
};

type DashboardAnalyticsPayload = {
  monthKeys: string[];
  kpis: {
    revenueThisMonth: number;
    costsThisMonth: number;
    netIncomeThisMonth: number;
    occupancyPct: number;
    activeContracts: number;
    openInvoices: number;
  };
  monthlySeries: Array<{
    monthKey: string;
    label: string;
    revenue: number;
    office: number;
    meeting: number;
    hotDesk: number;
    venue: number;
    virtualOffice: number;
    furniture: number;
    services: number;
    costsTotal: number;
    net: number;
  }>;
  occupancyByProperty: Array<{
    propertyId: string;
    name: string;
    occupancyPct: number;
    leasedOffices: number;
    totalOffices: number;
  }>;
};

function coerceFiniteNumber(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  if (Array.isArray(v)) return v.reduce((a, x) => a + coerceFiniteNumber(x), 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function moneyEur(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(x);
}

function moneyEurUnknown(v: unknown): string {
  return moneyEur(coerceFiniteNumber(v));
}

export default function DashboardPage() {
  const c = VILLAGEWORKS_BRAND.colors;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PropertyRow[]>([]);
  const [ownerTenantIds, setOwnerTenantIds] = useState<string[]>([]);
  const [ownerTenants, setOwnerTenants] = useState<TenantRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("manager");
  const [inviteTenantId, setInviteTenantId] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [pipelineTenantId, setPipelineTenantId] = useState("");
  const [pipelineEnabled, setPipelineEnabled] = useState(false);
  const [pipelineSlug, setPipelineSlug] = useState("");
  const [pipelineInboundEmail, setPipelineInboundEmail] = useState("");
  const [pipelineStagesText, setPipelineStagesText] = useState("");
  const [pipelineAutoAssignText, setPipelineAutoAssignText] = useState("{}");
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState<string | null>(null);

  const [chartPropertyId, setChartPropertyId] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analytics, setAnalytics] = useState<DashboardAnalyticsPayload | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = getSupabaseClient();
      setLoading(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        if (!cancelled) setError(userError.message);
        if (!cancelled) setLoading(false);
        return;
      }

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("memberships")
        .select("tenant_id,role");

      if (membershipsError) {
        if (!cancelled) setError(membershipsError.message);
        if (!cancelled) setLoading(false);
        return;
      }

      const membershipRows = (memberships ?? []) as MembershipRow[];
      const isSuperAdmin = membershipRows.some((m) => (m.role ?? "").toLowerCase() === "super_admin");
      const ownerTenantIds = membershipRows
        .filter((m) => (m.role ?? "").toLowerCase() === "owner")
        .map((m) => m.tenant_id)
        .filter(Boolean) as string[];
      if (!cancelled) setOwnerTenantIds(ownerTenantIds);

      if (isSuperAdmin) {
        router.replace("/super-admin");
        return;
      }

      if (!isSuperAdmin && ownerTenantIds.length === 0) {
        if (!cancelled) {
          setError("Not authorized to view the owner dashboard.");
          setRows([]);
          setLoading(false);
        }
        return;
      }

      let propertiesQuery = supabase
        .from("properties")
        .select(
          "id,tenant_id,name,address,postal_code,city,total_units,occupied_units,status"
        );

      if (!isSuperAdmin) {
        propertiesQuery = propertiesQuery.in("tenant_id", ownerTenantIds);
      }

      const { data: properties, error: propertiesError } = await propertiesQuery.order("name", {
        ascending: true,
      });

      if (propertiesError) {
        if (!cancelled) setError(propertiesError.message);
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setRows((properties as PropertyRow[]) ?? []);
      if (!cancelled && ownerTenantIds.length > 0) {
        const { data: tRows } = await supabase
          .from("tenants")
          .select("id,name")
          .in("id", ownerTenantIds)
          .order("name", { ascending: true });
        setOwnerTenants((tRows as TenantRow[]) ?? []);
        setInviteTenantId((prev) => prev || (tRows as TenantRow[])?.[0]?.id || "");
        const initialTenant = (tRows as TenantRow[])?.[0]?.id || "";
        setPipelineTenantId((prev) => prev || initialTenant);
      }
      if (!cancelled) setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (loading || rows.length === 0) return;
    let cancelled = false;
    (async () => {
      setAnalyticsLoading(true);
      setAnalyticsError(null);
      try {
        const q = chartPropertyId ? `?propertyId=${encodeURIComponent(chartPropertyId)}` : "";
        const res = await fetch(`/api/dashboard/analytics${q}`, { cache: "no-store" });
        const json = (await res.json()) as DashboardAnalyticsPayload & { error?: string };
        if (!res.ok) {
          if (!cancelled) setAnalyticsError(json.error ?? "Failed to load analytics");
          if (!cancelled) setAnalytics(null);
          return;
        }
        if (!cancelled) setAnalytics(json);
      } catch (e) {
        if (!cancelled) {
          setAnalyticsError(e instanceof Error ? e.message : "Failed to load analytics");
          setAnalytics(null);
        }
      } finally {
        if (!cancelled) setAnalyticsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, rows.length, chartPropertyId]);

  const kpiCards = useMemo(() => {
    const k = analytics?.kpis;
    return [
      {
        title: "Revenue (this month)",
        value: analyticsLoading || !k ? "…" : moneyEurUnknown(k.revenueThisMonth),
        sub: "From historical_revenue",
        tone: c.primary,
      },
      {
        title: "Costs (this month)",
        value: analyticsLoading || !k ? "…" : moneyEurUnknown(k.costsThisMonth),
        sub: "From historical_costs",
        tone: c.secondary,
      },
      {
        title: "Net income (this month)",
        value: analyticsLoading || !k ? "…" : moneyEurUnknown(k.netIncomeThisMonth),
        sub: "Revenue − costs",
        tone: k && coerceFiniteNumber(k.netIncomeThisMonth) >= 0 ? c.success : c.danger,
      },
      {
        title: "Office occupancy",
        value: analyticsLoading || !k ? "…" : `${coerceFiniteNumber(k.occupancyPct)}%`,
        sub: "Leased office spaces / bookable offices",
        tone: c.info,
      },
      {
        title: "Active contracts",
        value: analyticsLoading || !k ? "…" : String(k.activeContracts),
        sub: "room_contracts · active",
        tone: c.primary,
      },
      {
        title: "Open invoices",
        value: analyticsLoading || !k ? "…" : String(k.openInvoices),
        sub: "Draft, sent, or overdue",
        tone: c.warning,
      },
    ];
  }, [analytics?.kpis, analyticsLoading, c.danger, c.info, c.primary, c.secondary, c.success, c.warning]);

  const revenueBarData = useMemo(
    () =>
      (analytics?.monthlySeries ?? []).map((d) => ({
        label: d.label,
        revenue: d.revenue,
      })),
    [analytics?.monthlySeries],
  );

  const stackedCategoryData = useMemo(
    () =>
      (analytics?.monthlySeries ?? []).map((d) => ({
        label: d.label,
        "Office rent": d.office,
        "Meeting rooms": d.meeting,
        "Hot desks": d.hotDesk,
        Venues: d.venue,
        "Virtual office": d.virtualOffice,
        Furniture: d.furniture,
        "Add-on services": d.services,
      })),
    [analytics?.monthlySeries],
  );

  const netLineData = useMemo(
    () =>
      (analytics?.monthlySeries ?? []).map((d) => ({
        label: d.label,
        netPositive: d.net >= 0 ? d.net : null,
        netNegative: d.net < 0 ? d.net : null,
      })),
    [analytics?.monthlySeries],
  );

  const occupancyBarData = useMemo(() => {
    return (analytics?.occupancyByProperty ?? []).map((p) => {
      const raw = p.name;
      const label = typeof raw === "string" ? raw : raw == null ? "" : String(raw);
      const name = label.length > 22 ? `${label.slice(0, 20)}…` : label;
      return {
        name,
        occupancy: coerceFiniteNumber(p.occupancyPct),
        fullName: label,
      };
    });
  }, [analytics?.occupancyByProperty]);

  const chartEmpty =
    !analyticsLoading && !!analytics?.monthlySeries?.length && analytics.monthlySeries.every((d) => d.revenue === 0);

  async function onInviteTeamMember(e: FormEvent) {
    e.preventDefault();
    setInviteLoading(true);
    setInviteMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/invitations/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
          tenantId: inviteTenantId,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; invited?: boolean };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Invite failed");
        return;
      }
      setInviteMessage(
        json.invited
          ? "Invite sent. Team member will receive an email to set password."
          : "User already existed. Membership updated."
      );
      setInviteEmail("");
      setInviteRole("manager");
    } finally {
      setInviteLoading(false);
    }
  }

  async function loadPipelineSettings(tenantId: string) {
    if (!tenantId) return;
    const res = await fetch(`/api/leads/pipeline-settings?tenantId=${encodeURIComponent(tenantId)}`);
    const json = (await res.json()) as { settings?: PipelineSettingsRow | null; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load pipeline settings");
      return;
    }
    const s = json.settings;
    setPipelineEnabled(!!s?.enabled);
    setPipelineSlug(s?.contact_slug ?? "");
    setPipelineInboundEmail(s?.inbound_email ?? "");
    setPipelineStagesText((s?.custom_stages ?? []).join(", "));
    setPipelineAutoAssignText(JSON.stringify(s?.auto_assign_rules ?? {}, null, 2));
  }

  async function onSavePipelineSettings(e: FormEvent) {
    e.preventDefault();
    if (!pipelineTenantId) return;
    setPipelineSaving(true);
    setPipelineMessage(null);
    setError(null);
    try {
      let parsedRules: Record<string, unknown> = {};
      try {
        parsedRules = JSON.parse(pipelineAutoAssignText || "{}") as Record<string, unknown>;
      } catch {
        setError("Auto-assign rules must be valid JSON.");
        return;
      }
      const customStages = pipelineStagesText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/leads/pipeline-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: pipelineTenantId,
          enabled: pipelineEnabled,
          contactSlug: pipelineSlug || null,
          inboundEmail: pipelineInboundEmail || null,
          customStages: customStages.length ? customStages : null,
          autoAssignRules: parsedRules,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Failed to save pipeline settings");
        return;
      }
      setPipelineMessage("Pipeline settings saved.");
    } finally {
      setPipelineSaving(false);
    }
  }

  useEffect(() => {
    if (!pipelineTenantId) return;
    void loadPipelineSettings(pipelineTenantId);
  }, [pipelineTenantId]);

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <section style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontWeight: 600, letterSpacing: "-0.02em" }}>Dashboard</h1>
          <p style={{ margin: "6px 0 0", color: "#4b6b6a", lineHeight: 1.45 }}>
            Overview of occupancy, revenue and property operations.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/bookings" style={{ textDecoration: "none", color: c.white, background: c.primary, borderRadius: 8, padding: "9px 12px", fontWeight: 600 }}>
            Calendar
          </Link>
          <Link href="/reports" style={{ textDecoration: "none", color: c.primary, background: c.white, border: `1px solid ${c.primary}`, borderRadius: 8, padding: "9px 12px", fontWeight: 600 }}>
            Reports
          </Link>
        </div>
      </section>

      {analyticsError ? (
        <p style={{ color: "#b00020", fontSize: 14, margin: 0 }}>{analyticsError}</p>
      ) : null}

      <section style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", fontSize: 14, color: c.text }}>
          <span style={{ fontWeight: 600 }}>Charts &amp; KPIs</span>
          <select
            value={chartPropertyId}
            onChange={(e) => setChartPropertyId(e.target.value)}
            disabled={loading || rows.length === 0}
            style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${c.border}`, minWidth: 200, background: c.white }}
          >
            <option value="">All properties</option>
            {rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? p.id}
              </option>
            ))}
          </select>
          {analyticsLoading ? <span style={{ color: "#6a8080", fontSize: 13 }}>Loading charts…</span> : null}
        </label>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        {kpiCards.map((card) => (
          <article key={card.title} style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14 }}>
            <div style={{ borderLeft: `4px solid ${card.tone}`, paddingLeft: 10 }}>
              <div style={{ color: "#4f6767", fontSize: 12 }}>{card.title}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.text, marginTop: 4 }}>{loading ? "…" : card.value}</div>
              <div style={{ color: "#6a8080", fontSize: 12 }}>{card.sub}</div>
            </div>
          </article>
        ))}
      </section>

      <section className="vw-dash-grid-two" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <article style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14, minWidth: 0 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Revenue last 12 months</h2>
          <div style={{ width: "100%", minHeight: 300, minWidth: 0 }}>
            {analyticsLoading && !analytics ? (
              <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a8080" }}>
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueBarData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#557272" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#557272" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    formatter={(value, name) => [moneyEurUnknown(value), String(name ?? "Revenue")]}
                    contentStyle={{ borderRadius: 10, border: `1px solid ${c.border}` }}
                  />
                  <Bar dataKey="revenue" fill={c.primary} radius={[6, 6, 0, 0]} name="Revenue" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          {chartEmpty ? (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6a8080" }}>No historical revenue in this range. Import P&amp;L / revenue history to populate the chart.</p>
          ) : null}
        </article>
        <article style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14, minWidth: 0 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Office occupancy by property</h2>
          <div style={{ width: "100%", minHeight: 300, minWidth: 0 }}>
            {analyticsLoading && !analytics ? (
              <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a8080" }}>
                Loading…
              </div>
            ) : occupancyBarData.length === 0 ? (
              <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a8080", fontSize: 13, textAlign: "center", padding: 12 }}>
                No office-type spaces in bookable_spaces for the selected scope.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={occupancyBarData} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0f0" />
                  <XAxis type="number" domain={[0, 100]} unit="%" stroke="#557272" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" stroke="#557272" width={88} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value, name) => [`${coerceFiniteNumber(value)}%`, String(name ?? "Occupancy")]}
                    labelFormatter={(_, payload) =>
                      String((payload?.[0]?.payload as { fullName?: unknown } | undefined)?.fullName ?? "")
                    }
                    contentStyle={{ borderRadius: 10, border: `1px solid ${c.border}` }}
                  />
                  <Bar dataKey="occupancy" fill={c.secondary} radius={[0, 6, 6, 0]} name="Occupancy %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <article style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14, minWidth: 0 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Revenue by category (stacked)</h2>
          <div style={{ width: "100%", minHeight: 300, minWidth: 0, overflowX: "auto" }}>
            {analyticsLoading && !analytics ? (
              <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a8080" }}>
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300} minWidth={480}>
                <BarChart data={stackedCategoryData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#557272" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#557272" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: `1px solid ${c.border}` }}
                    formatter={(value, name) => [moneyEurUnknown(value), String(name ?? "")]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Office rent" stackId="a" fill={c.primary} />
                  <Bar dataKey="Meeting rooms" stackId="a" fill="#2d8b87" />
                  <Bar dataKey="Hot desks" stackId="a" fill="#5cb3af" />
                  <Bar dataKey="Venues" stackId="a" fill="#0d9488" />
                  <Bar dataKey="Virtual office" stackId="a" fill="#6366f1" />
                  <Bar dataKey="Furniture" stackId="a" fill="#a855f7" />
                  <Bar dataKey="Add-on services" stackId="a" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>

        <article style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14, minWidth: 0 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Net income trend</h2>
          <div style={{ width: "100%", minHeight: 300, minWidth: 0 }}>
            {analyticsLoading && !analytics ? (
              <div style={{ minHeight: 300, display: "flex", alignItems: "center", justifyContent: "center", color: "#6a8080" }}>
                Loading…
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={netLineData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#557272" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#557272" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip
                    contentStyle={{ borderRadius: 10, border: `1px solid ${c.border}` }}
                    formatter={(value, name) => [moneyEurUnknown(value), String(name ?? "")]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="netPositive" name="Net (≥ 0)" stroke={c.success} strokeWidth={2} dot={false} connectNulls />
                  <Line type="monotone" dataKey="netNegative" name={'Net (< 0)'} stroke={c.danger} strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </article>
      </section>

      <section className="vw-dash-grid-two" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 12 }}>
        <article style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Recent activity</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#3f5757", lineHeight: 1.6 }}>
            <li>Property data loaded and synchronized.</li>
            <li>Owner dashboard viewed.</li>
            <li>Latest occupancy snapshot updated.</li>
            <li>Reports module available.</li>
          </ul>
        </article>
        <article style={{ background: c.white, border: `1px solid ${c.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(13,61,59,0.06)", padding: 14 }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 16 }}>Upcoming tasks</h2>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#3f5757", lineHeight: 1.6 }}>
            <li>Review contracts expiring soon.</li>
            <li>Follow up overdue invoices.</li>
            <li>Check leads needing response.</li>
            <li>Confirm scheduled viewings.</li>
          </ul>
        </article>
      </section>

      <div style={{ marginTop: 22 }}>
        {ownerTenantIds.length > 0 ? (
          <div style={{ marginBottom: 18, border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Invite team member</h2>
            <form onSubmit={onInviteTeamMember} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Email address</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Role</span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                >
                  <option value="manager">Manager</option>
                  <option value="accounting">Accounting</option>
                  <option value="customer_service">Customer service</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Organization</span>
                <select
                  value={inviteTenantId}
                  onChange={(e) => setInviteTenantId(e.target.value)}
                  required
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                >
                  <option value="">Select organization…</option>
                  {ownerTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                disabled={inviteLoading}
                type="submit"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#111",
                  color: "#fff",
                  cursor: inviteLoading ? "not-allowed" : "pointer",
                }}
              >
                {inviteLoading ? "Sending..." : "Send invite"}
              </button>
              {inviteMessage ? <p style={{ margin: 0, color: "#1b5e20", fontSize: 13 }}>{inviteMessage}</p> : null}
            </form>
          </div>
        ) : null}

        {ownerTenantIds.length > 0 ? (
          <div style={{ marginBottom: 18, border: "1px solid #eee", borderRadius: 12, padding: 14 }}>
            <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>Owner pipeline settings</h2>
            <form onSubmit={onSavePipelineSettings} style={{ display: "grid", gap: 10, maxWidth: 640 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Organization</span>
                <select
                  value={pipelineTenantId}
                  onChange={(e) => setPipelineTenantId(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                >
                  {ownerTenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={pipelineEnabled}
                  onChange={(e) => setPipelineEnabled(e.target.checked)}
                />
                <span>Enable owner pipeline (off by default)</span>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Contact form slug</span>
                <input
                  value={pipelineSlug}
                  onChange={(e) => setPipelineSlug(e.target.value)}
                  placeholder="their-property-slug"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                />
              </label>
              {pipelineSlug ? (
                <p style={{ margin: 0, fontSize: 13, color: "#555" }}>
                  Public URL: /contact/{pipelineSlug}
                </p>
              ) : null}
              <label style={{ display: "grid", gap: 6 }}>
                <span>Inbound lead email (optional)</span>
                <input
                  type="email"
                  value={pipelineInboundEmail}
                  onChange={(e) => setPipelineInboundEmail(e.target.value)}
                  placeholder="leads@their-domain.com"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Custom pipeline stages (comma separated)</span>
                <input
                  value={pipelineStagesText}
                  onChange={(e) => setPipelineStagesText(e.target.value)}
                  placeholder="new, contacted, viewing, offer_sent, negotiation, won, lost"
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd" }}
                />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Auto-assign rules (JSON)</span>
                <textarea
                  rows={4}
                  value={pipelineAutoAssignText}
                  onChange={(e) => setPipelineAutoAssignText(e.target.value)}
                  style={{ padding: 10, borderRadius: 8, border: "1px solid #ddd", fontFamily: "monospace" }}
                />
              </label>
              <button
                disabled={pipelineSaving}
                type="submit"
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#111",
                  color: "#fff",
                  cursor: pipelineSaving ? "not-allowed" : "pointer",
                  width: 180,
                }}
              >
                {pipelineSaving ? "Saving..." : "Save settings"}
              </button>
              {pipelineMessage ? <p style={{ margin: 0, color: "#1b5e20", fontSize: 13 }}>{pipelineMessage}</p> : null}
            </form>
          </div>
        ) : null}

        {error ? (
          <p style={{ color: "#b00020" }}>Failed to load: {error}</p>
        ) : loading ? (
          <p>Loading...</p>
        ) : rows.length === 0 ? (
          <p>
            This account isn&apos;t connected to any owner organization (or they have
            no properties yet).
          </p>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              border: "1px solid #ddd",
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                  Property
                </th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                  Address
                </th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                  City
                </th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                  Occupancy
                </th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                  Status
                </th>
                <th style={{ textAlign: "left", padding: "10px", borderBottom: "1px solid #ddd" }}>
                  Reports
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, idx) => {
                const total = p.total_units ?? 0;
                const occupied = p.occupied_units ?? 0;
                const status = (p.status ?? "").toLowerCase();

                const statusPill =
                  status === "active"
                    ? { bg: "#e6f6ea", fg: "#1b5e20", bd: "#b7e1bf" }
                    : status === "under_renovation"
                      ? { bg: "#fff3cd", fg: "#7a5a00", bd: "#ffe69c" }
                      : { bg: "#fbe8ea", fg: "#b00020", bd: "#f3b7be" };

                return (
                  <tr key={p.id ?? `${p.tenant_id ?? "t"}-${idx}`}>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f0f0f0" }}>
                      {p.name ?? "(no name)"}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f0f0f0" }}>
                      <div>{p.address ?? "(no address)"}</div>
                      <div style={{ color: "#666", fontSize: 12 }}>
                        {p.postal_code ? `Postal code: ${p.postal_code}` : ""}
                      </div>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f0f0f0" }}>
                      {p.city ?? "(no city)"}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f0f0f0" }}>
                      {occupied}/{total}{" "}
                      <span style={{ color: "#666" }}>
                        {total > 0 ? `(${Math.round((occupied / total) * 100)}%)` : "(0%)"}
                      </span>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f0f0f0" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: statusPill.bg,
                          color: statusPill.fg,
                          border: `1px solid ${statusPill.bd}`,
                          fontSize: 12,
                        }}
                      >
                        {p.status ?? "inactive"}
                      </span>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid #f0f0f0", fontSize: 13 }}>
                      {p.id ? (
                        <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Link href={`/reports/rent-roll?propertyId=${encodeURIComponent(p.id)}`}>Rent roll</Link>
                          <Link href={`/reports/net-income?propertyId=${encodeURIComponent(p.id)}`}>Net income</Link>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <style>{`
        @media (max-width: 960px) {
          .vw-dash-grid-two {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

