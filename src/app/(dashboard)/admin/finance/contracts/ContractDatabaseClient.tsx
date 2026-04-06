"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { createClient } from "@/lib/supabase/client";

const C = {
  green: "#21524F",
  greenLight: "#2a6b67",
  beige: "#F3DFC6",
  beigeLight: "#FAF3EA",
  white: "#FFFFFF",
  gray50: "#F9FAFB",
  gray100: "#F3F4F6",
  gray200: "#E5E7EB",
  gray300: "#D1D5DB",
  gray400: "#9CA3AF",
  gray500: "#6B7280",
  gray600: "#4B5563",
  gray700: "#374151",
  gray900: "#111827",
  amber: "#D97706",
  emerald: "#059669",
  blue: "#2563EB",
  red: "#DC2626",
  indigo: "#4F46E5",
} as const;

const PROPERTY_COLORS: Record<string, string> = {
  "fcba7018-402f-4091-81b0-c2c1a7ae84b0": "#21524F",
  "d1fab239-9afc-4acb-aa8a-70bf5d3f262e": "#D97706",
  "ceefea18-1407-4399-a9f5-3c4430dffb5f": "#2563EB",
  "bfc1848d-891c-4e0e-bcc4-d5e6b042675f": "#059669",
  "2983e19c-e6d2-424f-9628-6a42ea872d51": "#8B5CF6",
};

const CONTRACT_TYPE_LABELS: Record<string, string> = {
  office_room: "Office room",
  virtual_office: "Virtual office",
  coworking: "Coworking",
  meeting_room: "Meeting room",
  venue: "Venue",
};

type TabId = "all" | "active" | "expiring" | "expired" | "drafts";

type DashboardStats = {
  signedDigitalCount: number;
  uniquePropertyCount: number;
  monthlyRevenueActive: number;
  expiring90Count: number;
  depositsHeld: number;
  depositsPendingCount: number;
};

type PropertyRow = { id: string; name: string | null };
type LinkedCompanyRow = {
  id: string;
  name: string | null;
  business_id: string | null;
  y_tunnus: string | null;
  vat_exempt?: boolean | null;
};

export type ContractRow = {
  id: string;
  status: string;
  contract_type: string | null;
  company_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  customer_name: string | null;
  customer_company: string | null;
  space_details: string | null;
  monthly_price: number | string | null;
  deposit_amount: number | string | null;
  deposit_status: string | null;
  deposit_type: string | null;
  interested_space_type?: string | null;
  start_date: string | null;
  end_date: string | null;
  contract_length_months: number | null;
  created_at: string;
  properties: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  /** Joined `customer_companies` row (alias `company`). */
  company?: LinkedCompanyRow | LinkedCompanyRow[] | null;
};

function unwrapOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  if (Array.isArray(x)) return (x[0] as T) ?? null;
  return x;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString("fi-FI", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatCurrency(amount: number | null): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(amount);
}

function toNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function effectiveEndDate(contract: ContractRow): Date | null {
  if (contract.end_date) {
    const d = new Date(contract.end_date);
    return Number.isNaN(+d) ? null : d;
  }
  if (contract.start_date && contract.contract_length_months != null) {
    const d = new Date(contract.start_date);
    if (Number.isNaN(+d)) return null;
    d.setMonth(d.getMonth() + Number(contract.contract_length_months));
    return d;
  }
  return null;
}

function formatEndDate(contract: ContractRow): string {
  const e = effectiveEndDate(contract);
  if (!e) return "—";
  return e.toLocaleDateString("fi-FI", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function getContractDisplayStatus(contract: ContractRow): { label: string; color: string; bgColor: string } {
  const today = startOfDay(new Date());
  const endDateRaw = effectiveEndDate(contract);
  const endDate = endDateRaw ? startOfDay(endDateRaw) : null;
  const ninetyDaysFromNow = new Date(today);
  ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);

  if (contract.status === "draft") {
    return { label: "Draft", color: C.gray500, bgColor: C.gray100 };
  }
  if (contract.status === "sent" || contract.status === "partially_signed") {
    return { label: "Pending", color: C.gray500, bgColor: C.gray100 };
  }
  if (contract.status === "signed_digital") {
    if (endDate && endDate < today) {
      return { label: "Expired", color: "#991B1B", bgColor: "#FEF2F2" };
    }
    if (endDate && endDate <= ninetyDaysFromNow) {
      return { label: "Expiring", color: "#92400E", bgColor: "#FFFBEB" };
    }
    return { label: "Active", color: "#065F46", bgColor: "#ECFDF5" };
  }
  return { label: contract.status, color: C.gray500, bgColor: C.gray100 };
}

export function getDepositDisplay(contract: ContractRow): {
  amount: string;
  label: string;
  color: string;
  icon: "check" | "clock" | "bank" | "return" | "none";
} {
  if (contract.deposit_type === "bank_guarantee" && toNum(contract.deposit_amount) > 0) {
    return {
      amount: formatCurrency(toNum(contract.deposit_amount)),
      label: "Bank guarantee",
      color: C.blue,
      icon: "bank",
    };
  }
  if (!contract.deposit_amount || contract.deposit_status === "not_required") {
    return { amount: "", label: "No deposit", color: C.gray300, icon: "none" };
  }
  const amount = formatCurrency(toNum(contract.deposit_amount));
  switch (contract.deposit_status) {
    case "received":
      return { amount, label: "Direct — received", color: C.emerald, icon: "check" };
    case "pending":
      return { amount, label: "Direct — pending", color: C.amber, icon: "clock" };
    case "to_be_returned":
      return { amount, label: "To be returned", color: C.gray400, icon: "return" };
    case "returned":
      return { amount, label: "Returned", color: C.gray400, icon: "return" };
    default:
      return { amount: "", label: "No deposit", color: C.gray300, icon: "none" };
  }
}

const TYPE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  ...Object.entries(CONTRACT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const DEPOSIT_FILTER_OPTIONS = [
  { value: "", label: "All deposit status" },
  { value: "received", label: "Received" },
  { value: "pending", label: "Pending" },
  { value: "bank_guarantee", label: "Bank guarantee" },
  { value: "none", label: "No deposit" },
] as const;

function effectiveContractType(contract: ContractRow): string {
  const t = (contract.contract_type || "office_room").trim();
  return t || "office_room";
}

function formatSpace(spaceDetails: string | null, _contractType: string): string {
  if (!spaceDetails) return "—";
  if (/^\d+$/.test(spaceDetails.trim())) {
    return `Room ${spaceDetails}`;
  }
  return spaceDetails;
}

function matchesDepositFilter(contract: ContractRow, filterVal: string): boolean {
  if (!filterVal) return true;
  if (filterVal === "bank_guarantee") return contract.deposit_type === "bank_guarantee";
  if (filterVal === "none") return !contract.deposit_amount || contract.deposit_status === "not_required";
  return contract.deposit_status === filterVal;
}

function matchesTab(contract: ContractRow, tab: TabId): boolean {
  const today = startOfDay(new Date());
  const end = effectiveEndDate(contract);
  const endDay = end ? startOfDay(end) : null;
  const ninety = new Date(today);
  ninety.setDate(ninety.getDate() + 90);

  switch (tab) {
    case "all":
      return contract.status !== "draft";
    case "active":
      if (contract.status !== "signed_digital") return false;
      if (!endDay) return true;
      return endDay >= today;
    case "expiring":
      if (contract.status !== "signed_digital") return false;
      if (!endDay) return false;
      return endDay >= today && endDay <= ninety;
    case "expired":
      if (contract.status !== "signed_digital") return false;
      if (!endDay) return false;
      return endDay < today;
    case "drafts":
      return ["draft", "sent", "partially_signed"].includes(contract.status);
    default:
      return true;
  }
}

function IconCheck({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconClock({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconBank({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10h18M4 10v10M20 10v10M7 14h2M15 14h2M6 20h12M2 22h20M12 2L2 7h20L12 2z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconReturn({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 14L4 9l5-5M4 9h12a4 4 0 014 4v6"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSyncOff({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DepositCell({ contract }: { contract: ContractRow }) {
  const d = getDepositDisplay(contract);
  const Icon =
    d.icon === "check"
      ? IconCheck
      : d.icon === "clock"
        ? IconClock
        : d.icon === "bank"
          ? IconBank
          : d.icon === "return"
            ? IconReturn
            : null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {d.amount ? <span style={{ fontWeight: 700, color: C.gray900 }}>{d.amount}</span> : null}
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10.5, color: d.color }}>
        {Icon ? <Icon color={d.color} /> : null}
        {d.label}
      </span>
    </div>
  );
}

const SELECT_LIST = `
  *,
  properties:property_id (id, name),
  company:company_id (id, name, business_id, y_tunnus, vat_exempt, email)
`;

const TAB_LABELS: { id: TabId; label: string }[] = [
  { id: "all", label: "All contracts" },
  { id: "active", label: "Active" },
  { id: "expiring", label: "Expiring soon" },
  { id: "expired", label: "Expired" },
  { id: "drafts", label: "Drafts" },
];

export default function ContractDatabaseClient() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [propertiesList, setPropertiesList] = useState<PropertyRow[]>([]);
  const [tab, setTab] = useState<TabId>("all");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [depositFilter, setDepositFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 15;

  const [stats, setStats] = useState<DashboardStats>({
    signedDigitalCount: 0,
    uniquePropertyCount: 0,
    monthlyRevenueActive: 0,
    expiring90Count: 0,
    depositsHeld: 0,
    depositsPendingCount: 0,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data: props, error: pErr } = await supabase.from("properties").select("id, name").order("name");
      if (pErr) throw pErr;
      setPropertiesList((props as PropertyRow[]) ?? []);

      const minSelect = `
        id,
        status,
        contract_type,
        company_id,
        lead_id,
        property_id,
        customer_name,
        customer_company,
        space_details,
        monthly_price,
        deposit_amount,
        deposit_status,
        deposit_type,
        start_date,
        end_date,
        contract_length_months,
        created_at,
        properties:property_id (id, name),
        company:company_id (id, name, business_id, y_tunnus, vat_exempt, email)
      `;

      const minSelectNoCompany = `
        id,
        status,
        contract_type,
        company_id,
        lead_id,
        property_id,
        customer_name,
        customer_company,
        space_details,
        monthly_price,
        deposit_amount,
        deposit_status,
        deposit_type,
        start_date,
        end_date,
        contract_length_months,
        created_at,
        properties:property_id (id, name)
      `;

      let list: ContractRow[] = [];
      {
        const first = await supabase.from("contracts").select(SELECT_LIST).order("created_at", { ascending: false });
        let cErr = first.error;
        if (!cErr) {
          list = (first.data as ContractRow[]) ?? [];
        } else {
          const retry = await supabase.from("contracts").select(minSelect).order("created_at", { ascending: false });
          cErr = retry.error;
          if (!cErr) {
            list = (retry.data as ContractRow[]) ?? [];
          } else {
            const retry2 = await supabase.from("contracts").select(minSelectNoCompany).order("created_at", { ascending: false });
            cErr = retry2.error;
            if (cErr) throw cErr;
            list = (retry2.data as ContractRow[]) ?? [];
          }
        }
      }

      const today = startOfDay(new Date());
      const ninety = new Date(today);
      ninety.setDate(ninety.getDate() + 90);

      function statsFromList(): DashboardStats {
        const signedDigital = list.filter((c) => c.status === "signed_digital");
        const activeForRevenue = signedDigital.filter((c) => {
          const e = effectiveEndDate(c);
          if (!e) return true;
          return startOfDay(e) >= today;
        });
        const monthlyRevenueActive = activeForRevenue.reduce((s, c) => s + toNum(c.monthly_price), 0);
        const expiring90Count = signedDigital.filter((c) => {
          const e = effectiveEndDate(c);
          if (!e) return false;
          const ed = startOfDay(e);
          return ed >= today && ed <= ninety;
        }).length;
        const depositsHeld = list
          .filter((c) => c.deposit_status === "received")
          .reduce((s, c) => s + toNum(c.deposit_amount), 0);
        const depositsPendingCount = list.filter((c) => c.deposit_status === "pending").length;
        const propsWithContracts = new Set(signedDigital.map((c) => c.property_id).filter(Boolean));
        return {
          signedDigitalCount: signedDigital.length,
          uniquePropertyCount: propsWithContracts.size,
          monthlyRevenueActive,
          expiring90Count,
          depositsHeld,
          depositsPendingCount,
        };
      }

      const [
        signedCountRes,
        signedPropsRes,
        revenueSlimRes,
        expiringSlimRes,
        depRecRes,
        pendCountRes,
      ] = await Promise.all([
        supabase.from("contracts").select("*", { count: "exact", head: true }).eq("status", "signed_digital"),
        supabase.from("contracts").select("property_id").eq("status", "signed_digital"),
        supabase
          .from("contracts")
          .select("monthly_price, end_date, start_date, contract_length_months")
          .eq("status", "signed_digital"),
        supabase.from("contracts").select("end_date, start_date, contract_length_months").eq("status", "signed_digital"),
        supabase.from("contracts").select("deposit_amount").eq("deposit_status", "received"),
        supabase.from("contracts").select("*", { count: "exact", head: true }).eq("deposit_status", "pending"),
      ]);

      const statsQueriesOk =
        !signedCountRes.error &&
        !signedPropsRes.error &&
        !revenueSlimRes.error &&
        !expiringSlimRes.error &&
        !depRecRes.error &&
        !pendCountRes.error;

      if (!statsQueriesOk) {
        setStats(statsFromList());
      } else {
        const signedDigitalCount = signedCountRes.count ?? 0;
        const propIds = (signedPropsRes.data ?? []) as { property_id: string | null }[];
        const uniquePropertyCount = new Set(propIds.map((r) => r.property_id).filter(Boolean)).size;

        const revenueRows = (revenueSlimRes.data ?? []) as Pick<
          ContractRow,
          "monthly_price" | "end_date" | "start_date" | "contract_length_months"
        >[];
        const monthlyRevenueActive = revenueRows
          .filter((r) => {
            const e = effectiveEndDate(r as ContractRow);
            if (!e) return true;
            return startOfDay(e) >= today;
          })
          .reduce((s, r) => s + toNum(r.monthly_price), 0);

        const expiringRows = (expiringSlimRes.data ?? []) as Pick<
          ContractRow,
          "end_date" | "start_date" | "contract_length_months"
        >[];
        const expiring90Count = expiringRows.filter((r) => {
          const e = effectiveEndDate(r as ContractRow);
          if (!e) return false;
          const ed = startOfDay(e);
          return ed >= today && ed <= ninety;
        }).length;

        const depRows = (depRecRes.data ?? []) as { deposit_amount: number | string | null }[];
        const depositsHeld = depRows.reduce((s, r) => s + toNum(r.deposit_amount), 0);
        const depositsPendingCount = pendCountRes.count ?? 0;

        setStats({
          signedDigitalCount,
          uniquePropertyCount,
          monthlyRevenueActive,
          expiring90Count,
          depositsHeld,
          depositsPendingCount,
        });
      }

      setContracts(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load contracts");
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contracts.filter((c) => {
      if (!matchesTab(c, tab)) return false;
      if (propertyFilter && c.property_id !== propertyFilter) return false;
      if (typeFilter && effectiveContractType(c) !== typeFilter) return false;
      if (!matchesDepositFilter(c, depositFilter)) return false;
      if (q) {
        const lc = unwrapOne(c.company);
        const searchMatch =
          (lc?.name || "").toLowerCase().includes(q) ||
          (c.customer_company || "").toLowerCase().includes(q) ||
          (c.customer_name || "").toLowerCase().includes(q) ||
          (lc?.y_tunnus || "").toLowerCase().includes(q) ||
          (lc?.business_id || "").toLowerCase().includes(q);
        if (!searchMatch) return false;
      }
      return true;
    });
  }, [contracts, tab, propertyFilter, typeFilter, depositFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [tab, propertyFilter, typeFilter, depositFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pageCount);
  const sliceStart = (safePage - 1) * perPage;
  const pageRows = filtered.slice(sliceStart, sliceStart + perPage);

  function exportCsv() {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const headers = [
      "Company",
      "BusinessId",
      "Property",
      "Type",
      "Space",
      "MonthlyRentEUR",
      "DepositEUR",
      "DepositStatus",
      "Start",
      "End",
      "ContractStatus",
    ];
    const lines = [
      headers.join(","),
      ...filtered.map((c) => {
        const lc = unwrapOne(c.company);
        const title = lc?.name || c.customer_company || c.customer_name || "—";
        const idLine = (lc?.y_tunnus || lc?.business_id || "").trim();
        const contact = (c.customer_name || "").trim();
        const subtitle = (idLine || (title !== contact ? contact : "")).trim();
        const prop = unwrapOne(c.properties);
        const st = getContractDisplayStatus(c);
        const dep = getDepositDisplay(c);
        const typeKey = effectiveContractType(c);
        return [
          esc(title),
          esc(subtitle),
          esc(prop?.name ?? "—"),
          esc(CONTRACT_TYPE_LABELS[typeKey] || "Office room"),
          esc(formatSpace(c.space_details, typeKey)),
          String(toNum(c.monthly_price)),
          String(toNum(c.deposit_amount)),
          esc(dep.label),
          esc(formatDate(c.start_date)),
          esc(formatEndDate(c)),
          esc(st.label),
        ].join(",");
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contracts-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const selectShell: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${C.gray200}`,
    background: C.white,
    fontSize: 13,
    fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
    color: C.gray900,
    minWidth: 140,
  };

  return (
    <DashboardLayout>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-instrument-serif), 'Instrument Serif', serif",
              fontSize: 26,
              fontWeight: 400,
              color: C.green,
            }}
          >
            Contract database
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: C.gray500, fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif" }}>
            Financial overview of all contracts — created via Sales Pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={() => exportCsv()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: `1px solid ${C.green}`,
            background: C.white,
            color: C.green,
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
          }}
        >
          Export
        </button>
      </div>

      {loadError ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 8,
            background: "#FEF2F2",
            color: "#991B1B",
            fontSize: 13,
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 10,
          marginTop: 18,
        }}
      >
        <div style={{ background: C.beigeLight, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Active contracts</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.green, marginTop: 6 }}>{stats.signedDigitalCount}</div>
          <div style={{ fontSize: 12, color: C.gray600, marginTop: 4 }}>across {stats.uniquePropertyCount} properties</div>
        </div>
        <div style={{ background: C.beigeLight, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Monthly revenue</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.green, marginTop: 6 }}>
            {formatCurrency(stats.monthlyRevenueActive || null)}
          </div>
        </div>
        <div style={{ background: C.beigeLight, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Expiring (90 days)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.amber, marginTop: 6 }}>{stats.expiring90Count}</div>
        </div>
        <div style={{ background: C.beigeLight, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Deposits held</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.green, marginTop: 6 }}>{formatCurrency(stats.depositsHeld || null)}</div>
        </div>
        <div style={{ background: C.beigeLight, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: C.gray500, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Deposits pending</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.amber, marginTop: 6 }}>{stats.depositsPendingCount}</div>
        </div>
      </div>

      <div style={{ marginTop: 20, borderBottom: `1px solid ${C.gray200}` }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {TAB_LABELS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                style={{
                  padding: "10px 14px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? C.green : C.gray600,
                  borderBottom: active ? `2px solid ${C.green}` : "2px solid transparent",
                  marginBottom: -1,
                  fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 10,
        }}
      >
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          style={selectShell}
          aria-label="Property filter"
        >
          <option value="">All properties</option>
          {propertiesList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name ?? p.id}
            </option>
          ))}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={selectShell} aria-label="Type filter">
          {TYPE_FILTER_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={depositFilter}
          onChange={(e) => setDepositFilter(e.target.value)}
          style={selectShell}
          aria-label="Deposit status filter"
        >
          {DEPOSIT_FILTER_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div style={{ flex: "1 1 160px", display: "flex", justifyContent: "flex-end" }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company or contact…"
            style={{
              ...selectShell,
              width: "100%",
              maxWidth: 280,
              minWidth: 120,
            }}
            aria-label="Search"
          />
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          border: `1px solid ${C.gray200}`,
          borderRadius: 8,
          overflow: "hidden",
          background: C.white,
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr style={{ background: C.gray50 }}>
                {[
                  "Company",
                  "Property",
                  "Type",
                  "Space",
                  "Monthly rent",
                  "Deposit",
                  "Start",
                  "End",
                  "Status",
                  "Sync",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: h === "Sync" ? "center" : "left",
                      padding: "10px 14px",
                      fontSize: 10.5,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: C.gray500,
                      fontWeight: 600,
                      borderBottom: `1px solid ${C.gray200}`,
                      fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: C.gray500, fontSize: 13 }}>
                    Loading…
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 24, textAlign: "center", color: C.gray500, fontSize: 13 }}>
                    No contracts match the current filters.
                  </td>
                </tr>
              ) : (
                pageRows.map((c) => {
                  const lc = unwrapOne(c.company);
                  const companyLine1 = lc?.name || c.customer_company || c.customer_name || "—";
                  const idLine = (lc?.y_tunnus || lc?.business_id || "").trim();
                  const contact = (c.customer_name || "").trim();
                  const companySubtitle = (idLine || (companyLine1 !== contact ? contact : "")).trim();
                  const prop = unwrapOne(c.properties);
                  const propColor = (c.property_id && PROPERTY_COLORS[c.property_id]) || C.gray300;
                  const st = getContractDisplayStatus(c);
                  const typeKey = effectiveContractType(c);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => console.log("Open contract detail:", c.id)}
                      style={{
                        cursor: "pointer",
                        fontSize: 12.5,
                        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = C.beigeLight;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = "transparent";
                      }}
                    >
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.gray100}`, verticalAlign: "top" }}>
                        <div style={{ fontWeight: 500, fontSize: "13px", color: "#111827" }}>{companyLine1}</div>
                        {companySubtitle ? (
                          <div style={{ fontSize: "10.5px", color: "#9CA3AF", marginTop: "1px" }}>{companySubtitle}</div>
                        ) : null}
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.gray100}`, verticalAlign: "top" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: propColor,
                              flexShrink: 0,
                            }}
                          />
                          <span style={{ color: C.gray700 }}>{prop?.name ?? "—"}</span>
                        </div>
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.gray100}`, verticalAlign: "top" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "11px",
                            fontWeight: 500,
                            background: "#F3DFC6",
                            color: "#21524F",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {CONTRACT_TYPE_LABELS[typeKey] || "Office room"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: `1px solid ${C.gray100}`,
                          verticalAlign: "top",
                          color: C.gray700,
                          maxWidth: 220,
                        }}
                      >
                        {formatSpace(c.space_details, typeKey)}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: `1px solid ${C.gray100}`,
                          verticalAlign: "top",
                          fontWeight: 500,
                          color: C.gray900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatCurrency(toNum(c.monthly_price) || null)}
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.gray100}`, verticalAlign: "top" }}>
                        <DepositCell contract={c} />
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: `1px solid ${C.gray100}`,
                          verticalAlign: "top",
                          color: C.gray700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDate(c.start_date)}
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: `1px solid ${C.gray100}`,
                          verticalAlign: "top",
                          color: C.gray700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatEndDate(c)}
                      </td>
                      <td style={{ padding: "12px 14px", borderBottom: `1px solid ${C.gray100}`, verticalAlign: "top" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 10px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            color: st.color,
                            background: st.bgColor,
                          }}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 14px",
                          borderBottom: `1px solid ${C.gray100}`,
                          verticalAlign: "middle",
                          textAlign: "center",
                        }}
                      >
                        <IconSyncOff color={C.gray400} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          fontSize: 12.5,
          color: C.gray600,
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        }}
      >
        <span>
          Showing {filtered.length === 0 ? 0 : sliceStart + 1}–{Math.min(sliceStart + perPage, filtered.length)} of{" "}
          {filtered.length} contracts
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              style={{
                minWidth: 32,
                height: 32,
                borderRadius: 6,
                border: `1px solid ${n === safePage ? C.green : C.gray200}`,
                background: n === safePage ? C.beigeLight : C.white,
                color: n === safePage ? C.green : C.gray700,
                cursor: "pointer",
                fontWeight: n === safePage ? 600 : 500,
                fontSize: 13,
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
