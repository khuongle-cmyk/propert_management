"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { createClient } from "@/lib/supabase/client";

/* ── colour tokens (shared with ContractDatabase) ── */
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

/* ── types ── */
type InvoiceStatus = "draft" | "approved" | "sent" | "paid" | "overdue" | "credited" | "cancelled";
type InvoiceType = "rent" | "deposit" | "credit_note" | "one_time";
type TabId = "all" | "draft" | "approved" | "sent" | "paid" | "overdue";

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_type: InvoiceType;
  invoice_date: string;
  due_date: string;
  period_start: string;
  period_end: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  status: InvoiceStatus;
  notes: string | null;
  created_at: string;
  contract_id: string | null;
  property_id: string | null;
  company_id: string | null;
  properties: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
  customer_companies: { id: string; name: string | null } | { id: string; name: string | null }[] | null;
};

type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  row_total: number;
  product_code: string | null;
  sort_order: number;
};

type PropertyOption = { id: string; name: string | null; tenant_id: string | null };

type DashboardStats = {
  totalInvoices: number;
  draftCount: number;
  totalRevenue: number;
  paidRevenue: number;
  overdueCount: number;
  overdueAmount: number;
};

/* ── helpers ── */
function unwrapOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  if (Array.isArray(x)) return (x[0] as T) ?? null;
  return x;
}

function formatDate(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  if (Number.isNaN(+d)) return "—";
  return d.toLocaleDateString("fi-FI", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(amount: number | null): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(amount);
}

const STATUS_CONFIG: Record<InvoiceStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: "Draft", bg: C.gray100, fg: C.gray600 },
  approved: { label: "Approved", bg: "#DBEAFE", fg: C.blue },
  sent: { label: "Sent", bg: "#E0E7FF", fg: C.indigo },
  paid: { label: "Paid", bg: "#D1FAE5", fg: C.emerald },
  overdue: { label: "Overdue", bg: "#FEE2E2", fg: C.red },
  credited: { label: "Credited", bg: "#FEF3C7", fg: C.amber },
  cancelled: { label: "Cancelled", bg: C.gray100, fg: C.gray400 },
};

const TYPE_LABELS: Record<InvoiceType, string> = {
  rent: "Rent",
  deposit: "Deposit",
  credit_note: "Credit Note",
  one_time: "One-time",
};

/* ═══════════════════════════════════════════════════════
   COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function InvoicingClient() {
  const supabase = createClient();

  /* ── state ── */
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [filterProperty, setFilterProperty] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState<DashboardStats>({
    totalInvoices: 0, draftCount: 0, totalRevenue: 0, paidRevenue: 0, overdueCount: 0, overdueAmount: 0,
  });

  /* generate modal */
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [genYear, setGenYear] = useState(new Date().getFullYear());
  const [genMonth, setGenMonth] = useState(new Date().getMonth() + 1);
  const [genProperty, setGenProperty] = useState("");
  const [genDryRun, setGenDryRun] = useState(true);
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);

  /* detail modal */
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRow | null>(null);
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([]);
  const [lineItemsLoading, setLineItemsLoading] = useState(false);

  /* bulk selection */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const PER_PAGE = 20;

  /* ── fetch invoices ── */
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select(`
        *,
        properties:property_id ( id, name ),
        customer_companies:company_id ( id, name )
      `)
      .order("invoice_date", { ascending: false });

    if (!error && data) {
      setInvoices(data as InvoiceRow[]);

      /* compute stats */
      const all = data as InvoiceRow[];
      const drafts = all.filter((i) => i.status === "draft");
      const paid = all.filter((i) => i.status === "paid");
      const overdue = all.filter((i) => i.status === "overdue");
      setStats({
        totalInvoices: all.length,
        draftCount: drafts.length,
        totalRevenue: all.reduce((s, i) => s + (i.total || 0), 0),
        paidRevenue: paid.reduce((s, i) => s + (i.total || 0), 0),
        overdueCount: overdue.length,
        overdueAmount: overdue.reduce((s, i) => s + (i.total || 0), 0),
      });
    }
    setLoading(false);
  }, [supabase]);

  /* ── fetch properties ── */
  const fetchProperties = useCallback(async () => {
    const { data } = await supabase.from("properties").select("id, name, tenant_id").order("name");
    if (data) setProperties(data as PropertyOption[]);
  }, [supabase]);

  useEffect(() => {
    fetchInvoices();
    fetchProperties();
  }, [fetchInvoices, fetchProperties]);

  /* ── fetch line items for detail modal ── */
  const fetchLineItems = useCallback(async (invoiceId: string) => {
    setLineItemsLoading(true);
    const { data } = await supabase
      .from("invoice_rows")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order");
    if (data) setLineItems(data);
    setLineItemsLoading(false);
  }, [supabase]);

  /* ── generate invoices ── */
  const handleGenerate = async () => {
    const propertyIdForTenant = genProperty || filterProperty;
    const tenantId = propertyIdForTenant
      ? properties.find((p) => p.id === propertyIdForTenant)?.tenant_id ?? null
      : null;
    if (!tenantId) {
      setGenResult({
        error:
          "Select a property in the generate dialog or set the property filter so we know which tenant to run for.",
      });
      return;
    }

    setGenLoading(true);
    setGenResult(null);
    try {
      const res = await fetch("/api/invoicing/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetYear: genYear,
          targetMonth: genMonth,
          tenantId,
          propertyId: genProperty || undefined,
          dryRun: genDryRun,
        }),
      });
      const json = await res.json();
      setGenResult(json);
      if (!genDryRun && json.success) {
        fetchInvoices();
      }
    } catch (err) {
      setGenResult({ error: "Network error" });
    }
    setGenLoading(false);
  };

  /* ── bulk status update ── */
  const handleBulkStatusUpdate = async (newStatus: InvoiceStatus) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const ids = Array.from(selectedIds);
    const { error } = await supabase
      .from("invoices")
      .update({ status: newStatus })
      .in("id", ids);
    if (!error) {
      setSelectedIds(new Set());
      fetchInvoices();
    }
    setBulkLoading(false);
  };

  /* ── single status update ── */
  const handleStatusUpdate = async (invoiceId: string, newStatus: InvoiceStatus) => {
    await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId);
    fetchInvoices();
    if (selectedInvoice?.id === invoiceId) {
      setSelectedInvoice((prev) => prev ? { ...prev, status: newStatus } : null);
    }
  };

  /* ── filtered + tabbed list ── */
  const filtered = useMemo(() => {
    let list = [...invoices];

    if (activeTab !== "all") {
      list = list.filter((i) => i.status === activeTab);
    }
    if (filterProperty) {
      list = list.filter((i) => i.property_id === filterProperty);
    }
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      list = list.filter((i) => {
        const company = unwrapOne(i.customer_companies);
        return (
          i.invoice_number.toLowerCase().includes(q) ||
          (company?.name || "").toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [invoices, activeTab, filterProperty, filterSearch]);

  const paged = filtered.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  /* ── tab counts ── */
  const tabCounts = useMemo(() => {
    const counts: Record<TabId, number> = { all: 0, draft: 0, approved: 0, sent: 0, paid: 0, overdue: 0 };
    counts.all = invoices.length;
    invoices.forEach((i) => {
      if (i.status in counts) counts[i.status as TabId]++;
    });
    return counts;
  }, [invoices]);

  /* ── toggle selection ── */
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === paged.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paged.map((i) => i.id)));
    }
  };

  /* ══════════ RENDER ══════════ */
  return (
    <DashboardLayout>
      <div style={{ padding: "32px 40px", maxWidth: 1400, margin: "0 auto" }}>
        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 28, fontWeight: 500, color: C.gray900, margin: 0 }}>
              Invoicing
            </h1>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: C.gray500, margin: "4px 0 0" }}>
              Manage invoices, generate billing, and track payments
            </p>
          </div>
          <button
            onClick={() => { setShowGenerateModal(true); setGenResult(null); setGenDryRun(true); }}
            style={{
              padding: "10px 20px",
              background: C.green,
              color: C.white,
              border: "none",
              borderRadius: 8,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 18 }}>+</span> Generate Invoices
          </button>
        </div>

        {/* ── Stats Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
          {[
            { label: "Total Invoices", value: stats.totalInvoices.toString(), color: C.gray900 },
            { label: "Drafts Pending", value: stats.draftCount.toString(), color: C.amber },
            { label: "Total Billed", value: formatCurrency(stats.totalRevenue), color: C.green },
            { label: "Paid Revenue", value: formatCurrency(stats.paidRevenue), color: C.emerald },
            { label: "Overdue", value: `${stats.overdueCount} (${formatCurrency(stats.overdueAmount)})`, color: C.red },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: C.white,
                borderRadius: 12,
                padding: "20px 24px",
                border: `1px solid ${C.gray200}`,
              }}
            >
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: C.gray500, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {card.label}
              </p>
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700, color: card.color, margin: "8px 0 0" }}>
                {card.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.gray200}`, paddingBottom: 0 }}>
          {(["all", "draft", "approved", "sent", "paid", "overdue"] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setPage(0); }}
              style={{
                padding: "10px 16px",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? C.green : C.gray500,
                background: "none",
                border: "none",
                borderBottom: activeTab === tab ? `2px solid ${C.green}` : "2px solid transparent",
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}{" "}
              <span style={{ fontSize: 11, color: C.gray400 }}>({tabCounts[tab]})</span>
            </button>
          ))}
        </div>

        {/* ── Filters + Bulk actions ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
          <select
            value={filterProperty}
            onChange={(e) => { setFilterProperty(e.target.value); setPage(0); }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.gray200}`,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: C.gray700,
              background: C.white,
              minWidth: 160,
            }}
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <input
            placeholder="Search invoice # or company..."
            value={filterSearch}
            onChange={(e) => { setFilterSearch(e.target.value); setPage(0); }}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: `1px solid ${C.gray200}`,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: C.gray700,
              flex: 1,
              maxWidth: 320,
            }}
          />

          {selectedIds.size > 0 && (
            <div style={{ display: "flex", gap: 8, marginLeft: "auto", alignItems: "center" }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.gray500 }}>
                {selectedIds.size} selected
              </span>
              {activeTab === "draft" && (
                <button
                  onClick={() => handleBulkStatusUpdate("approved")}
                  disabled={bulkLoading}
                  style={{
                    padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.blue}`,
                    background: C.white, color: C.blue, fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Approve
                </button>
              )}
              {(activeTab === "approved" || activeTab === "draft") && (
                <button
                  onClick={() => handleBulkStatusUpdate("sent")}
                  disabled={bulkLoading}
                  style={{
                    padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.indigo}`,
                    background: C.white, color: C.indigo, fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Mark Sent
                </button>
              )}
              <button
                onClick={() => handleBulkStatusUpdate("cancelled")}
                disabled={bulkLoading}
                style={{
                  padding: "7px 14px", borderRadius: 6, border: `1px solid ${C.red}`,
                  background: C.white, color: C.red, fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div style={{ background: C.white, borderRadius: 12, border: `1px solid ${C.gray200}`, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif" }}>
            <thead>
              <tr style={{ background: C.gray50 }}>
                <th style={{ ...thStyle, width: 40 }}>
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && selectedIds.size === paged.length}
                    onChange={toggleSelectAll}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={thStyle}>Invoice #</th>
                <th style={thStyle}>Company</th>
                <th style={thStyle}>Property</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Period</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Subtotal</th>
                <th style={{ ...thStyle, textAlign: "right" }}>VAT</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                <th style={thStyle}>Due Date</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} style={{ padding: 40, textAlign: "center", color: C.gray400, fontSize: 14 }}>
                    Loading invoices...
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={11} style={{ padding: 40, textAlign: "center", color: C.gray400, fontSize: 14 }}>
                    No invoices found
                  </td>
                </tr>
              ) : (
                paged.map((inv) => {
                  const prop = unwrapOne(inv.properties);
                  const comp = unwrapOne(inv.customer_companies);
                  const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;
                  const propColor = prop?.id ? PROPERTY_COLORS[prop.id] || C.gray400 : C.gray400;

                  return (
                    <tr
                      key={inv.id}
                      onClick={() => { setSelectedInvoice(inv); fetchLineItems(inv.id); }}
                      style={{ borderTop: `1px solid ${C.gray100}`, cursor: "pointer", transition: "background 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = C.gray50)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={{ ...tdStyle, width: 40 }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(inv.id)}
                          onChange={() => toggleSelect(inv.id)}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontWeight: 600, color: C.gray900, fontSize: 13 }}>{inv.invoice_number}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: C.gray700, fontSize: 13 }}>{comp?.name || "—"}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: C.gray600 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: propColor, display: "inline-block" }} />
                          {prop?.name || "—"}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
                          background: C.beigeLight, color: C.gray700,
                        }}>
                          {TYPE_LABELS[inv.invoice_type] || inv.invoice_type}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: C.gray500 }}>
                          {formatDate(inv.period_start)} – {formatDate(inv.period_end)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontSize: 13, color: C.gray700 }}>
                        {formatCurrency(inv.subtotal)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontSize: 13, color: C.gray400 }}>
                        {formatCurrency(inv.vat_amount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontSize: 13, fontWeight: 600, color: C.gray900 }}>
                        {formatCurrency(inv.total)}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontSize: 12, color: C.gray500 }}>{formatDate(inv.due_date)}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                          background: sc.bg, color: sc.fg,
                        }}>
                          {sc.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.gray500 }}>
              Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
                style={{ ...paginationBtn, opacity: page === 0 ? 0.4 : 1 }}
              >
                ‹ Prev
              </button>
              <button
                disabled={page >= totalPages - 1}
                onClick={() => setPage(page + 1)}
                style={{ ...paginationBtn, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
              >
                Next ›
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══════════ GENERATE MODAL ══════════ */}
      {showGenerateModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setShowGenerateModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: 16, padding: 32, width: 560,
              maxHeight: "80vh", overflow: "auto", boxShadow: "0 25px 50px rgba(0,0,0,0.15)",
            }}
          >
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, fontWeight: 500, color: C.gray900, margin: "0 0 8px" }}>
              Generate Invoices
            </h2>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.gray500, margin: "0 0 24px" }}>
              Create draft invoices for active contracts
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={labelStyle}>Year</label>
                <input
                  type="number"
                  value={genYear}
                  onChange={(e) => setGenYear(Number(e.target.value))}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Month</label>
                <select value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))} style={inputStyle}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {new Date(2026, i).toLocaleString("en", { month: "long" })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Property (optional)</label>
              <select value={genProperty} onChange={(e) => setGenProperty(e.target.value)} style={inputStyle}>
                <option value="">All properties</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                id="dryrun"
                checked={genDryRun}
                onChange={(e) => setGenDryRun(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label htmlFor="dryrun" style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.gray700, cursor: "pointer" }}>
                Preview only (dry run) — don't create invoices yet
              </label>
            </div>

            {/* Result */}
            {genResult && (
              <div style={{
                background: genResult.error ? "#FEF2F2" : C.gray50,
                borderRadius: 10, padding: 16, marginBottom: 20,
                border: `1px solid ${genResult.error ? "#FECACA" : C.gray200}`,
              }}>
                {genResult.error ? (
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.red, margin: 0 }}>
                    Error: {genResult.error}
                  </p>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 20, marginBottom: genResult.summary?.generated?.length > 0 ? 12 : 0 }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: C.emerald }}>{genResult.summary?.total_generated || 0}</span>{" "}
                        <span style={{ color: C.gray500 }}>{genDryRun ? "will be generated" : "generated"}</span>
                      </span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: C.amber }}>{genResult.summary?.total_skipped || 0}</span>{" "}
                        <span style={{ color: C.gray500 }}>skipped</span>
                      </span>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: C.red }}>{genResult.summary?.total_errors || 0}</span>{" "}
                        <span style={{ color: C.gray500 }}>errors</span>
                      </span>
                    </div>
                    {genResult.summary?.generated?.map((g: any) => (
                      <div key={g.contract_id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "8px 0", borderTop: `1px solid ${C.gray200}`,
                        fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, color: C.gray900 }}>{g.invoice_number}</span>
                          <span style={{ color: C.gray500, marginLeft: 8 }}>{g.company_name} — {g.property_name}</span>
                        </div>
                        <span style={{ fontWeight: 600, color: C.green }}>{formatCurrency(g.total)}</span>
                      </div>
                    ))}
                    {genResult.summary?.skipped?.map((s: any) => (
                      <div key={s.contract_id} style={{
                        padding: "6px 0", borderTop: `1px solid ${C.gray100}`,
                        fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: C.gray400,
                      }}>
                        Skipped: {s.reason}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowGenerateModal(false)}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                  background: C.white, color: C.gray700, fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13, fontWeight: 500, cursor: "pointer",
                }}
              >
                Close
              </button>
              <button
                onClick={handleGenerate}
                disabled={genLoading}
                style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: genDryRun ? C.blue : C.green, color: C.white,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: genLoading ? "wait" : "pointer", opacity: genLoading ? 0.6 : 1,
                }}
              >
                {genLoading ? "Working..." : genDryRun ? "Preview" : "Generate Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ DETAIL MODAL ══════════ */}
      {selectedInvoice && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
          }}
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: 16, padding: 32, width: 640,
              maxHeight: "85vh", overflow: "auto", boxShadow: "0 25px 50px rgba(0,0,0,0.15)",
            }}
          >
            {(() => {
              const inv = selectedInvoice;
              const prop = unwrapOne(inv.properties);
              const comp = unwrapOne(inv.customer_companies);
              const sc = STATUS_CONFIG[inv.status] || STATUS_CONFIG.draft;

              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                    <div>
                      <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, fontWeight: 500, color: C.gray900, margin: 0 }}>
                        {inv.invoice_number}
                      </h2>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: C.gray500, margin: "4px 0 0" }}>
                        {comp?.name || "—"} — {prop?.name || "—"}
                      </p>
                    </div>
                    <span style={{
                      padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                      background: sc.bg, color: sc.fg,
                    }}>
                      {sc.label}
                    </span>
                  </div>

                  {/* Info grid */}
                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24,
                    padding: 20, background: C.gray50, borderRadius: 10,
                  }}>
                    {[
                      { label: "Invoice Date", value: formatDate(inv.invoice_date) },
                      { label: "Due Date", value: formatDate(inv.due_date) },
                      { label: "Type", value: TYPE_LABELS[inv.invoice_type] || inv.invoice_type },
                      { label: "Period Start", value: formatDate(inv.period_start) },
                      { label: "Period End", value: formatDate(inv.period_end) },
                      { label: "VAT Rate", value: `${inv.vat_rate}%` },
                    ].map((item) => (
                      <div key={item.label}>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: C.gray400, margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {item.label}
                        </p>
                        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: C.gray900, margin: "4px 0 0" }}>
                          {item.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Line items */}
                  <h3 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: C.gray900, margin: "0 0 12px" }}>
                    Line Items
                  </h3>
                  <div style={{ border: `1px solid ${C.gray200}`, borderRadius: 10, overflow: "hidden", marginBottom: 24 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "'DM Sans', sans-serif" }}>
                      <thead>
                        <tr style={{ background: C.gray50 }}>
                          <th style={{ ...thStyle, fontSize: 11 }}>Description</th>
                          <th style={{ ...thStyle, fontSize: 11, textAlign: "center" }}>Qty</th>
                          <th style={{ ...thStyle, fontSize: 11, textAlign: "right" }}>Unit Price</th>
                          <th style={{ ...thStyle, fontSize: 11, textAlign: "right" }}>VAT</th>
                          <th style={{ ...thStyle, fontSize: 11, textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineItemsLoading ? (
                          <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>Loading...</td></tr>
                        ) : lineItems.length === 0 ? (
                          <tr><td colSpan={5} style={{ padding: 20, textAlign: "center", color: C.gray400, fontSize: 13 }}>No line items</td></tr>
                        ) : (
                          lineItems.map((li) => (
                            <tr key={li.id} style={{ borderTop: `1px solid ${C.gray100}` }}>
                              <td style={{ ...tdStyle, fontSize: 12, maxWidth: 240 }}>
                                {li.description}
                                {li.product_code && (
                                  <span style={{ display: "block", fontSize: 10, color: C.gray400, marginTop: 2 }}>{li.product_code}</span>
                                )}
                              </td>
                              <td style={{ ...tdStyle, fontSize: 12, textAlign: "center" }}>{li.quantity} {li.unit}</td>
                              <td style={{ ...tdStyle, fontSize: 12, textAlign: "right" }}>{formatCurrency(li.unit_price)}</td>
                              <td style={{ ...tdStyle, fontSize: 12, textAlign: "right", color: C.gray400 }}>{formatCurrency(li.vat_amount)}</td>
                              <td style={{ ...tdStyle, fontSize: 12, textAlign: "right", fontWeight: 600 }}>{formatCurrency(li.row_total)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Totals */}
                  <div style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6,
                    padding: "16px 20px", background: C.beigeLight, borderRadius: 10, marginBottom: 24,
                  }}>
                    <div style={{ display: "flex", gap: 40, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                      <span style={{ color: C.gray500 }}>Subtotal</span>
                      <span style={{ color: C.gray700, fontWeight: 500 }}>{formatCurrency(inv.subtotal)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 40, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
                      <span style={{ color: C.gray500 }}>VAT ({inv.vat_rate}%)</span>
                      <span style={{ color: C.gray700, fontWeight: 500 }}>{formatCurrency(inv.vat_amount)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 40, fontFamily: "'DM Sans', sans-serif", fontSize: 16, marginTop: 4 }}>
                      <span style={{ color: C.gray900, fontWeight: 600 }}>Total</span>
                      <span style={{ color: C.green, fontWeight: 700 }}>{formatCurrency(inv.total)}</span>
                    </div>
                  </div>

                  {/* Notes */}
                  {inv.notes && (
                    <div style={{ padding: 16, background: C.gray50, borderRadius: 10, marginBottom: 24 }}>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: C.gray400, margin: "0 0 4px", textTransform: "uppercase" }}>Notes</p>
                      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: C.gray700, margin: 0 }}>{inv.notes}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    {inv.status === "draft" && (
                      <button onClick={() => handleStatusUpdate(inv.id, "approved")} style={{ ...actionBtn, borderColor: C.blue, color: C.blue }}>
                        Approve
                      </button>
                    )}
                    {(inv.status === "draft" || inv.status === "approved") && (
                      <button onClick={() => handleStatusUpdate(inv.id, "sent")} style={{ ...actionBtn, borderColor: C.indigo, color: C.indigo }}>
                        Mark Sent
                      </button>
                    )}
                    {(inv.status === "sent" || inv.status === "overdue") && (
                      <button onClick={() => handleStatusUpdate(inv.id, "paid")} style={{ ...actionBtn, borderColor: C.emerald, color: C.emerald }}>
                        Mark Paid
                      </button>
                    )}
                    {inv.status !== "cancelled" && inv.status !== "paid" && (
                      <button onClick={() => handleStatusUpdate(inv.id, "cancelled")} style={{ ...actionBtn, borderColor: C.red, color: C.red }}>
                        Cancel
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedInvoice(null)}
                      style={{
                        padding: "8px 18px", borderRadius: 8, border: `1px solid ${C.gray200}`,
                        background: C.white, color: C.gray600, fontFamily: "'DM Sans', sans-serif",
                        fontSize: 13, fontWeight: 500, cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

/* ── shared styles ── */
const thStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: C.gray500,
  textAlign: "left",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  color: C.gray700,
};

const paginationBtn: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: `1px solid ${C.gray200}`,
  background: C.white,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  color: C.gray600,
  cursor: "pointer",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  color: C.gray600,
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  borderRadius: 8,
  border: `1px solid ${C.gray200}`,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 13,
  color: C.gray700,
  background: C.white,
  boxSizing: "border-box",
};

const actionBtn: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid",
  background: C.white,
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
