"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useCustomerPortal } from "@/context/CustomerPortalContext";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { formatDate } from "@/lib/date/format";

const PETROL = "#0D4F4F";

type LineItem = {
  description?: string;
  quantity?: number;
  unit_price?: number;
  amount?: number;
};

type Inv = {
  id: string;
  invoice_number: string;
  status: string;
  amount: string | number;
  currency: string;
  due_date: string;
  issue_date: string;
  created_at: string;
  description: string | null;
  line_items: LineItem[] | unknown;
};

function statusStyle(status: string): { bg: string; fg: string; label: string } {
  const s = status.toLowerCase();
  if (s === "paid") return { bg: "#dcfce7", fg: "#15803d", label: "Paid" };
  if (s === "overdue") return { bg: "#fee2e2", fg: "#b91c1c", label: "Overdue" };
  if (s === "cancelled") return { bg: "#f1f5f9", fg: "#64748b", label: "Cancelled" };
  return { bg: "#fef9c3", fg: "#a16207", label: "Unpaid" };
}

async function downloadInvoicePdf(inv: Inv) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const items = Array.isArray(inv.line_items) ? (inv.line_items as LineItem[]) : [];
  doc.setFontSize(16);
  doc.text("Invoice", 14, 18);
  doc.setFontSize(10);
  doc.text(`Invoice #: ${inv.invoice_number}`, 14, 28);
  doc.text(`Issue date: ${formatDate(inv.issue_date)}`, 14, 34);
  doc.text(`Due date: ${formatDate(inv.due_date)}`, 14, 40);
  doc.text(`Status: ${inv.status}`, 14, 46);
  doc.text(`Amount: ${inv.currency} ${Number(inv.amount).toFixed(2)}`, 14, 52);
  let y = 62;
  if (inv.description) {
    doc.text("Description:", 14, y);
    y += 6;
    const split = doc.splitTextToSize(inv.description, 180);
    doc.text(split, 14, y);
    y += 6 + split.length * 5;
  }
  if (items.length > 0) {
    doc.text("Line items", 14, y);
    y += 8;
    items.forEach((line) => {
      const row = [
        line.description ?? "—",
        String(line.quantity ?? 1),
        `${inv.currency} ${Number(line.unit_price ?? 0).toFixed(2)}`,
        `${inv.currency} ${Number(line.amount ?? 0).toFixed(2)}`,
      ].join("  ·  ");
      doc.text(row.slice(0, 120), 14, y);
      y += 6;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });
  }
  doc.save(`invoice-${inv.invoice_number}.pdf`);
}

export default function CustomerPortalInvoicesPage() {
  const { customerUser } = useCustomerPortal();
  const isCompanyAdmin = String(customerUser?.role ?? "").toLowerCase() === "company_admin";
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [rows, setRows] = useState<Inv[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!customerUser?.company_id) return;
    setErr(null);

    let query = supabase
      .from("invoices")
      .select("id, invoice_number, status, total, currency, due_date, invoice_date, created_at, notes")
      .eq("company_id", customerUser.company_id)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (fromDate) query = query.gte("invoice_date", fromDate);
    if (toDate) query = query.lte("invoice_date", toDate);

    const { data: invData, error: loadError } = await query;

    if (loadError) {
      setErr(loadError.message);
      setRows([]);
      return;
    }

    type RawInv = {
      id: string;
      invoice_number: string;
      status: string;
      total: string | number | null;
      currency: string;
      due_date: string;
      invoice_date: string;
      created_at: string;
      notes: string | null;
    };

    const raw = (invData ?? []) as RawInv[];
    const invoiceIds = raw.map((r) => r.id);

    const lineItemsByInvoice: Record<string, LineItem[]> = {};

    if (invoiceIds.length > 0) {
      const { data: lineRowsData, error: lineErr } = await supabase
        .from("invoice_rows")
        .select("invoice_id, description, quantity, unit_price, row_total, sort_order")
        .in("invoice_id", invoiceIds);

      if (lineErr) {
        setErr(lineErr.message);
        setRows([]);
        return;
      }

      const buckets: Record<
        string,
        Array<{
          invoice_id: string;
          description: string | null;
          quantity: unknown;
          unit_price: unknown;
          row_total: unknown;
          sort_order: number | null;
        }>
      > = {};

      for (const row of lineRowsData ?? []) {
        const rid = row.invoice_id;
        if (!buckets[rid]) buckets[rid] = [];
        buckets[rid].push(row);
      }

      for (const invId of Object.keys(buckets)) {
        buckets[invId].sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
        lineItemsByInvoice[invId] = buckets[invId].map((r) => ({
          description: r.description ?? undefined,
          quantity: Number(r.quantity),
          unit_price: Number(r.unit_price),
          amount: Number(r.row_total),
        }));
      }
    }

    const rowsRaw: Inv[] = raw.map((r) => ({
      id: r.id,
      invoice_number: r.invoice_number,
      status: r.status,
      amount: r.total ?? 0,
      currency: r.currency,
      due_date: r.due_date,
      issue_date: r.invoice_date,
      created_at: r.created_at,
      description: r.notes,
      line_items: lineItemsByInvoice[r.id] ?? [],
    }));

    setRows(rowsRaw);
  }, [customerUser, supabase, statusFilter, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const th: CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    background: PETROL,
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
  };
  const td: CSSProperties = { padding: "10px 12px", borderBottom: "1px solid #e5e7eb", fontSize: 13, verticalAlign: "top" };

  if (!isCompanyAdmin) {
    return (
      <div style={{ display: "grid", gap: 16, padding: "40px 0" }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: PETROL }}>Invoices</h1>
        <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>
          Invoice access is limited to company administrators. Please contact your company admin if you need to view invoices.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: PETROL }}>Invoices</h1>
      <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>All invoices for your company.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 500 }}>
          Status
          <select
            className="vw-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: 140 }}
          >
            <option value="all">All</option>
            <option value="pending">Unpaid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 500 }}>
          From
          <input type="date" className="vw-input" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 500 }}>
          To
          <input type="date" className="vw-input" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button type="button" className="vw-btn-secondary" onClick={() => void load()}>
          Apply
        </button>
      </div>

      {err ? <p style={{ color: "#b91c1c" }}>{err}</p> : null}

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Invoice", "Date", "Due date", "Amount", "Status", "Actions"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = statusStyle(r.status);
              const open = expanded === r.id;
              const items = Array.isArray(r.line_items) ? (r.line_items as LineItem[]) : [];
              return (
                <Fragment key={r.id}>
                  <tr
                    style={{ cursor: "pointer", background: open ? "#f8fafc" : undefined }}
                    onClick={() => setExpanded((prev) => (prev === r.id ? null : r.id))}
                  >
                    <td style={td}>{r.invoice_number}</td>
                    <td style={td}>{formatDate(r.issue_date)}</td>
                    <td style={td}>{formatDate(r.due_date)}</td>
                    <td style={td}>
                      €{Number(r.amount).toFixed(2)}
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          background: st.bg,
                          color: st.fg,
                        }}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        className="vw-btn-secondary"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((prev) => (prev === r.id ? null : r.id));
                        }}
                      >
                        {open ? "Hide" : "View"} details
                      </button>{" "}
                      <button
                        type="button"
                        className="vw-btn-primary"
                        style={{ padding: "6px 10px", fontSize: 12 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadInvoicePdf(r);
                        }}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                  {open ? (
                    <tr key={`${r.id}-detail`}>
                      <td colSpan={6} style={{ ...td, background: "#f8fafc", padding: 16 }}>
                        {r.description ? (
                          <p style={{ margin: "0 0 8px", fontSize: 14 }}>
                            <strong>Description:</strong> {r.description}
                          </p>
                        ) : null}
                        {items.length > 0 ? (
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th style={{ textAlign: "left", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Item</th>
                                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Qty</th>
                                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Unit</th>
                                <th style={{ textAlign: "right", padding: 8, borderBottom: "1px solid #e2e8f0" }}>Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((line, i) => (
                                <tr key={i}>
                                  <td style={{ padding: 8 }}>{line.description ?? "—"}</td>
                                  <td style={{ padding: 8, textAlign: "right" }}>{line.quantity ?? 1}</td>
                                  <td style={{ padding: 8, textAlign: "right" }}>
                                    €{Number(line.unit_price ?? 0).toFixed(2)}
                                  </td>
                                  <td style={{ padding: 8, textAlign: "right" }}>
                                    €{Number(line.amount ?? 0).toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>No line items.</p>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && !err ? <p style={{ padding: 16, margin: 0, color: "#64748b" }}>No invoices match your filters.</p> : null}
      </div>
    </div>
  );
}
