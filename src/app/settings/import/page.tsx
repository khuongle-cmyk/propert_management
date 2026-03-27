"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { ImportType } from "@/lib/historical-import/types";
import { getSupabaseClient } from "@/lib/supabase/browser";

type Software = "generic" | "procountor" | "netvisor" | "visma";
type PreviewRow = Record<string, string | number | null>;
type ProcountorExportType = "sales_invoices" | "purchase_invoices" | "general_ledger";
type MappingDataType = "revenue" | "cost";
type RevenueCategory =
  | "office_rent"
  | "meeting_room_revenue"
  | "hot_desk_revenue"
  | "venue_revenue"
  | "additional_services"
  | "other_revenue";
type CostCategory =
  | "cleaning"
  | "utilities"
  | "property_management"
  | "insurance"
  | "security"
  | "it_infrastructure"
  | "marketing"
  | "staff"
  | "one_off_cost"
  | "other_cost";
type ProcountorCostCenterMapping = {
  propertyId: string;
  dataType: MappingDataType;
  category: RevenueCategory | CostCategory;
  active: boolean;
  name: string;
};
type Batch = {
  id: string;
  import_type: string;
  source_software: string | null;
  file_name: string | null;
  rows_imported: number;
  rows_failed: number;
  imported_by: string;
  created_at: string;
};

const typeLabel: Record<ImportType, string> = {
  revenue: "Historical revenue",
  costs: "Historical costs",
  invoices: "Historical invoices",
  occupancy: "Historical occupancy",
};

const REVENUE_CATEGORIES: RevenueCategory[] = [
  "office_rent",
  "meeting_room_revenue",
  "hot_desk_revenue",
  "venue_revenue",
  "additional_services",
  "other_revenue",
];
const COST_CATEGORIES: CostCategory[] = [
  "cleaning",
  "utilities",
  "property_management",
  "insurance",
  "security",
  "it_infrastructure",
  "marketing",
  "staff",
  "one_off_cost",
  "other_cost",
];

const presets: Record<Software, Record<string, string>> = {
  generic: {},
  procountor: {
    "laskunumero": "invoice_number",
    "päivämäärä": "invoice_date",
    "eräpäivä": "due_date",
    "asiakas": "client_name",
    "y-tunnus": "business_id",
    "veroton_summa": "amount_ex_vat",
    "alv_summa": "vat_amount",
    "yhteensä": "total_amount",
    "maksettu": "paid_amount",
    "tila": "status",
    "maksettu_pvm": "payment_date",
    "projekti": "procountor_property_code",
    "tiliöinti": "cost_category",
    "toimittaja": "supplier_name",
    "tili": "account_code",
    "selite": "description",
    "kustannuspaikka": "procountor_property_code",
    "tilin_nimi": "account_name",
    "debet": "debit_amount",
    "kredit": "credit_amount",
    "saldo": "balance",
    "kirjauspäivä": "posting_date",
  },
  netvisor: {
    "päivämäärä": "date",
    "velotusmäärä": "amount_ex_vat",
    "kuvaus": "description",
  },
  visma: {
    "päivämäärä": "date",
    "summa": "amount_ex_vat",
    "kuvaus": "description",
    "alv": "vat_amount",
  },
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function mapRow(row: Record<string, unknown>, software: Software): PreviewRow {
  const out: PreviewRow = {};
  const map = presets[software];
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeHeader(k);
    out[map[nk] ?? nk] = typeof v === "string" ? v.trim() : (v as number | null);
  }
  return out;
}

async function fileToRows(file: File, software: Software): Promise<PreviewRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    const txt = await file.text();
    const wb = XLSX.read(txt, { type: "string" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    return rows.map((r) => mapRow(r, software));
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return rows.map((r) => mapRow(r, software));
}

export default function SettingsImportPage() {
  const [importType, setImportType] = useState<ImportType>("revenue");
  const [software, setSoftware] = useState<Software>("generic");
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "overwrite" | "merge">("skip");
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string | null; city: string | null }>>([]);
  const [procountorExportType, setProcountorExportType] = useState<ProcountorExportType>("sales_invoices");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [costCenterMappings, setCostCenterMappings] = useState<Record<string, ProcountorCostCenterMapping>>({});
  const [savedMappingsLoaded, setSavedMappingsLoaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [invoiceDuplicateChoice, setInvoiceDuplicateChoice] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<Batch[]>([]);
  const [manual, setManual] = useState<Record<string, string>>({
    property: "",
    year: String(new Date().getUTCFullYear()),
    month: String(new Date().getUTCMonth() + 1),
    office_rent_revenue: "",
    meeting_room_revenue: "",
    hot_desk_revenue: "",
    venue_revenue: "",
    additional_services_revenue: "",
    total_revenue: "",
    date: "",
    cost_type: "one_off",
    description: "",
    amount_ex_vat: "",
    vat_amount: "",
    total_amount: "",
    supplier: "",
    invoice_number: "",
    due_date: "",
    client_tenant: "",
    status: "unpaid",
    payment_date: "",
    total_rooms: "",
    occupied_rooms: "",
    occupancy_pct: "",
    revenue_per_m2: "",
  });

  const previewHead = useMemo(() => {
    if (!rows.length) return [];
    return Object.keys(rows[0]).filter((k) => !k.startsWith("__")).slice(0, 12);
  }, [rows]);
  const procountorCodes = useMemo(() => {
    if (software !== "procountor") return [];
    return [...new Set(rows.map((r) => String(r.procountor_property_code ?? "").trim()).filter(Boolean))];
  }, [rows, software]);
  const unmappedProcountorCodes = useMemo(() => {
    if (software !== "procountor") return [];
    return procountorCodes.filter((c) => {
      const m = costCenterMappings[c];
      return !m || (m.active && !m.propertyId);
    });
  }, [software, procountorCodes, costCenterMappings]);
  const costCenterSourceFiles = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const r of rows) {
      const code = String(r.procountor_property_code ?? "").trim();
      const f = String(r.__source_file ?? "").trim();
      if (!code || !f) continue;
      if (!out[code]) out[code] = [];
      if (!out[code].includes(f)) out[code].push(f);
    }
    return out;
  }, [rows]);
  const invoiceDuplicateGroups = useMemo(() => {
    if (importType !== "invoices") return [] as Array<{ key: string; rows: PreviewRow[] }>;
    const byInvoice = new Map<string, PreviewRow[]>();
    for (const r of rows) {
      const key = String(r.invoice_number ?? "").trim();
      if (!key) continue;
      const arr = byInvoice.get(key) ?? [];
      arr.push(r);
      byInvoice.set(key, arr);
    }
    return [...byInvoice.entries()].filter(([, list]) => list.length > 1).map(([key, list]) => ({ key, rows: list }));
  }, [rows, importType]);

  async function loadPropertiesAndMappings() {
    const supa = getSupabaseClient();
    const { data: mRows } = await supa.from("memberships").select("tenant_id");
    const tenantIds = [...new Set((mRows ?? []).map((m) => m.tenant_id).filter(Boolean))] as string[];
    let pq = supa.from("properties").select("id,name,city,tenant_id").order("name", { ascending: true });
    if (tenantIds.length) pq = pq.in("tenant_id", tenantIds);
    const { data: pRows } = await pq;
    setProperties((pRows ?? []) as Array<{ id: string; name: string | null; city: string | null }>);
    const m = await fetch("/api/settings/import/procountor-mappings");
    const j = (await m.json()) as {
      mappings?: Array<{
        cost_center_code: string;
        cost_center_name: string | null;
        property_id: string;
        data_type: MappingDataType;
        category: RevenueCategory | CostCategory;
        active: boolean;
      }>;
    };
    const next: Record<string, ProcountorCostCenterMapping> = {};
    (j.mappings ?? []).forEach((x) => {
      next[x.cost_center_code] = {
        propertyId: x.property_id,
        dataType: x.data_type,
        category: x.category,
        active: x.active,
        name: x.cost_center_name ?? "",
      };
    });
    setCostCenterMappings(next);
    setSavedMappingsLoaded((j.mappings ?? []).length > 0);
  }

  async function loadHistory() {
    const r = await fetch("/api/settings/import/history");
    const j = (await r.json()) as { error?: string; batches?: Batch[] };
    if (!r.ok) {
      setMsg(j.error ?? "Could not load history");
      return;
    }
    setHistory(j.batches ?? []);
  }

  async function onFiles(filesInput: FileList | File[] | null) {
    const files = filesInput ? Array.from(filesInput) : [];
    if (!files.length) return;
    setLoading(true);
    setMsg(null);
    try {
      const mergedRows: PreviewRow[] = [];
      for (const file of files) {
        const parsed = await fileToRows(file, software);
        const transformed =
          software === "procountor"
            ? parsed.map((r, idx) => {
                const out = { ...r };
                if (procountorExportType === "sales_invoices") {
                  out.invoice_date = r.invoice_date ?? r.date ?? null;
                  out.property = (r.procountor_property_code as string | null) ?? null;
                  out.client_tenant = r.client_name ?? null;
                  const st = String(r.status ?? "").toLowerCase();
                  out.status = st === "maksettu" ? "paid" : st === "erääntynyt" ? "overdue" : "unpaid";
                } else if (procountorExportType === "purchase_invoices") {
                  out.date = r.invoice_date ?? r.date ?? null;
                  out.property = (r.procountor_property_code as string | null) ?? null;
                  out.supplier = r.supplier_name ?? null;
                } else {
                  out.date = r.posting_date ?? r.date ?? null;
                  out.amount_ex_vat = Number(r.credit_amount ?? 0) - Number(r.debit_amount ?? 0);
                  out.vat_amount = 0;
                  out.total_amount = out.amount_ex_vat;
                  out.description = r.account_name ?? r.description ?? null;
                  out.property = (r.procountor_property_code as string | null) ?? null;
                }
                out.__source_file = file.name;
                out.__source_row = idx + 2;
                out.__row_id = `${file.name}#${idx + 2}`;
                return out;
              })
            : parsed.map((r, idx) => ({ ...r, __source_file: file.name, __source_row: idx + 2, __row_id: `${file.name}#${idx + 2}` }));
        mergedRows.push(...transformed);
      }

      setRows(mergedRows);
      setFileName(files.length === 1 ? files[0].name : `${files.length} files`);
      setFileNames(files.map((f) => f.name));
      if (software === "procountor") {
        const detectedCodes = [...new Set(mergedRows.map((r) => String(r.procountor_property_code ?? "").trim()).filter(Boolean))];
        const newCodes = detectedCodes.filter((c) => !costCenterMappings[c]);
        if (newCodes.length) {
          setCostCenterMappings((prev) => {
            const next = { ...prev };
            for (const code of newCodes) {
              next[code] = {
                propertyId: "",
                dataType: importType === "costs" ? "cost" : "revenue",
                category: importType === "costs" ? "one_off_cost" : "office_rent",
                active: true,
                name: String(mergedRows.find((r) => String(r.procountor_property_code ?? "").trim() === code)?.cost_center_name ?? ""),
              };
            }
            return next;
          });
          setMsg(`Loaded ${mergedRows.length} row(s) from ${files.length} file(s). New cost center(s): ${newCodes.join(", ")}. Please map before importing.`);
        } else {
          setMsg(`Loaded ${mergedRows.length} row(s) from ${files.length} file(s). Using saved Procountor mapping.`);
        }
      } else {
        setMsg(`Loaded ${mergedRows.length} row(s) from ${files.length} file(s). Review preview then import.`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not parse file");
      setRows([]);
      setFileNames([]);
    } finally {
      setLoading(false);
    }
  }

  async function importRows(payloadRows: PreviewRow[], dataSource: "manual" | "excel" | "accounting_software") {
    if (!payloadRows.length) {
      setMsg("No rows to import.");
      return;
    }
    setLoading(true);
    setMsg(null);
    let mappedRows = payloadRows;
    if (software === "procountor") {
      const unresolved = payloadRows
        .map((r) => String(r.procountor_property_code ?? "").trim())
        .filter((c) => c && (!costCenterMappings[c] || !costCenterMappings[c].propertyId));
      if (unresolved.length) {
        setLoading(false);
        setMsg(`New/unmapped cost center(s): ${[...new Set(unresolved)].join(", ")}. Map them before importing.`);
        return;
      }

      const out: PreviewRow[] = [];
      for (const r of payloadRows) {
        const code = String(r.procountor_property_code ?? "").trim();
        const m = costCenterMappings[code];
        if (!m || !m.active) continue;
        const propertyName = properties.find((p) => p.id === m.propertyId)?.name ?? code;
        const baseAmount =
          Number(r.amount_ex_vat ?? 0) ||
          (Number(r.total_amount ?? 0) - Number(r.vat_amount ?? 0)) ||
          Number(r.total_amount ?? 0);
        const dateRaw = String(r.invoice_date ?? r.date ?? r.posting_date ?? "").slice(0, 10);
        const d = dateRaw ? new Date(dateRaw) : null;
        const year = d && !Number.isNaN(d.getTime()) ? d.getUTCFullYear() : Number(r.year ?? 0);
        const month = d && !Number.isNaN(d.getTime()) ? d.getUTCMonth() + 1 : Number(r.month ?? 0);

        if (importType === "revenue") {
          if (m.dataType !== "revenue") continue;
          const row: PreviewRow = {
            property: propertyName,
            property_id: m.propertyId,
            year,
            month,
            office_rent_revenue: 0,
            meeting_room_revenue: 0,
            hot_desk_revenue: 0,
            venue_revenue: 0,
            additional_services_revenue: 0,
            total_revenue: baseAmount,
          };
          if (m.category === "office_rent") row.office_rent_revenue = baseAmount;
          else if (m.category === "meeting_room_revenue") row.meeting_room_revenue = baseAmount;
          else if (m.category === "hot_desk_revenue") row.hot_desk_revenue = baseAmount;
          else if (m.category === "venue_revenue") row.venue_revenue = baseAmount;
          else row.additional_services_revenue = baseAmount;
          out.push(row);
        } else if (importType === "costs") {
          if (m.dataType !== "cost") continue;
          const categoryToCostType: Record<string, string> = {
            cleaning: "cleaning",
            utilities: "utilities",
            property_management: "property_management",
            insurance: "insurance",
            security: "security",
            it_infrastructure: "it_infrastructure",
            marketing: "marketing",
            staff: "staff",
            one_off_cost: "one_off",
            other_cost: "one_off",
          };
          out.push({
            ...r,
            property: propertyName,
            property_id: m.propertyId,
            date: dateRaw || r.date,
            cost_type: categoryToCostType[m.category] ?? "one_off",
            amount_ex_vat: baseAmount,
            vat_amount: Number(r.vat_amount ?? 0),
            total_amount: Number(r.total_amount ?? baseAmount + Number(r.vat_amount ?? 0)),
          });
        } else if (importType === "invoices") {
          out.push({
            ...r,
            property: propertyName,
            property_id: m.propertyId,
          });
        } else if (importType === "occupancy") {
          out.push({
            ...r,
            property: propertyName,
            property_id: m.propertyId,
            year,
            month,
          });
        }
      }
      mappedRows = out;
    }
    if (importType === "invoices") {
      const byInvoice = new Map<string, PreviewRow[]>();
      for (const r of mappedRows) {
        const key = String(r.invoice_number ?? "").trim();
        if (!key) continue;
        const arr = byInvoice.get(key) ?? [];
        arr.push(r);
        byInvoice.set(key, arr);
      }
      const resolved: PreviewRow[] = [];
      for (const [key, arr] of byInvoice.entries()) {
        if (arr.length === 1) {
          resolved.push(arr[0]);
          continue;
        }
        const sameAmounts = arr.every(
          (x) =>
            Number(x.amount_ex_vat ?? 0) === Number(arr[0].amount_ex_vat ?? 0) &&
            Number(x.vat_amount ?? 0) === Number(arr[0].vat_amount ?? 0) &&
            Number(x.total_amount ?? 0) === Number(arr[0].total_amount ?? 0),
        );
        if (sameAmounts) {
          resolved.push(arr[0]);
          continue;
        }
        const selected = invoiceDuplicateChoice[key];
        if (!selected) {
          setLoading(false);
          setMsg(`Duplicate invoice detected across files: ${key}. Choose which row to keep in duplicate review.`);
          return;
        }
        const picked = arr.find((x) => String(x.__row_id ?? "") === selected) ?? arr[0];
        resolved.push(picked);
      }
      mappedRows = resolved;
    }

    const r = await fetch("/api/settings/import/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        importType,
        duplicateMode,
        sourceSoftware: software === "procountor" ? `procountor:${procountorExportType}` : software,
        fileName: fileName || "manual",
        dataSource,
        rows: mappedRows,
        procountorExportType,
      }),
    });
    const j = (await r.json()) as { error?: string; rowsImported?: number; rowsFailed?: number };
    setLoading(false);
    if (!r.ok) {
      setMsg(j.error ?? "Import failed");
      return;
    }
    setMsg(`Import complete: ${j.rowsImported ?? 0} imported, ${j.rowsFailed ?? 0} failed.`);
    await loadHistory();
  }

  async function importManual() {
    const row: PreviewRow = {};
    if (importType === "revenue") {
      Object.assign(row, {
        property: manual.property,
        year: Number(manual.year),
        month: Number(manual.month),
        office_rent_revenue: Number(manual.office_rent_revenue || 0),
        meeting_room_revenue: Number(manual.meeting_room_revenue || 0),
        hot_desk_revenue: Number(manual.hot_desk_revenue || 0),
        venue_revenue: Number(manual.venue_revenue || 0),
        additional_services_revenue: Number(manual.additional_services_revenue || 0),
        total_revenue: Number(manual.total_revenue || 0),
      });
    } else if (importType === "costs") {
      Object.assign(row, {
        property: manual.property,
        date: manual.date,
        cost_type: manual.cost_type,
        description: manual.description,
        amount_ex_vat: Number(manual.amount_ex_vat || 0),
        vat_amount: Number(manual.vat_amount || 0),
        total_amount: Number(manual.total_amount || 0),
        supplier: manual.supplier,
        invoice_number: manual.invoice_number,
      });
    } else if (importType === "invoices") {
      Object.assign(row, {
        property: manual.property,
        invoice_number: manual.invoice_number,
        invoice_date: manual.date,
        due_date: manual.due_date,
        client_tenant: manual.client_tenant,
        amount_ex_vat: Number(manual.amount_ex_vat || 0),
        vat_amount: Number(manual.vat_amount || 0),
        total_amount: Number(manual.total_amount || 0),
        status: manual.status,
        payment_date: manual.payment_date,
      });
    } else {
      Object.assign(row, {
        property: manual.property,
        year: Number(manual.year),
        month: Number(manual.month),
        total_rooms: Number(manual.total_rooms || 0),
        occupied_rooms: Number(manual.occupied_rooms || 0),
        occupancy_pct: Number(manual.occupancy_pct || 0),
        revenue_per_m2: Number(manual.revenue_per_m2 || 0),
      });
    }
    await importRows([row], "manual");
  }

  async function rollback(batchId: string) {
    if (!window.confirm("Rollback this import batch?")) return;
    const r = await fetch("/api/settings/import/rollback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(j.error ?? "Rollback failed");
      return;
    }
    setMsg("Batch rolled back.");
    await loadHistory();
  }

  async function saveProcountorMappings() {
    const payload = Object.entries(costCenterMappings)
      .filter(([k, v]) => k.trim() && v.propertyId.trim())
      .map(([code, value]) => ({
        costCenterCode: code,
        costCenterName: value.name || code,
        propertyId: value.propertyId,
        dataType: value.dataType,
        category: value.category,
        active: value.active,
      }));
    if (!payload.length) {
      setMsg("No Procountor cost center mappings to save.");
      return;
    }
    const r = await fetch("/api/settings/import/procountor-mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: payload }),
    });
    const j = (await r.json()) as { error?: string };
    if (!r.ok) {
      setMsg(j.error ?? "Could not save mappings");
      return;
    }
    setSavedMappingsLoaded(true);
    setMsg("Procountor cost center mappings saved for future imports.");
  }

  function applyBulkDuplicateChoice(mode: "first" | "latest_file" | "merge_exact" | "clear") {
    if (mode === "clear") {
      setInvoiceDuplicateChoice({});
      return;
    }
    const fileOrder = new Map(fileNames.map((f, i) => [f, i]));
    setInvoiceDuplicateChoice((prev) => {
      const next = { ...prev };
      for (const g of invoiceDuplicateGroups) {
        if (mode === "first") {
          const firstId = String(g.rows[0]?.__row_id ?? "");
          if (firstId) next[g.key] = firstId;
          continue;
        }
        if (mode === "latest_file") {
          const picked = [...g.rows]
            .sort(
              (a, b) =>
                (fileOrder.get(String(b.__source_file ?? "")) ?? -1) - (fileOrder.get(String(a.__source_file ?? "")) ?? -1),
            )[0];
          const rowId = String(picked?.__row_id ?? "");
          if (rowId) next[g.key] = rowId;
          continue;
        }
        const sameAmounts = g.rows.every(
          (x) =>
            Number(x.amount_ex_vat ?? 0) === Number(g.rows[0]?.amount_ex_vat ?? 0) &&
            Number(x.vat_amount ?? 0) === Number(g.rows[0]?.vat_amount ?? 0) &&
            Number(x.total_amount ?? 0) === Number(g.rows[0]?.total_amount ?? 0),
        );
        if (sameAmounts) {
          const rowId = String(g.rows[0]?.__row_id ?? "");
          if (rowId) next[g.key] = rowId;
        }
      }
      return next;
    });
  }

  return (
    <main style={{ display: "grid", gap: 14 }}>
      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff" }}>
        <h1 style={{ margin: 0 }}>Historical data import</h1>
        <p style={{ color: "#64748b", marginBottom: 0 }}>
          Import 2+ years of revenue, costs, invoices, and occupancy for reporting baseline.
        </p>
        <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 0 }}>
          <Link href="/reports">Reports</Link>
          <Link href="/settings/import">Settings → Data import</Link>
        </p>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>File import (Excel/CSV + accounting exports)</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label>
            Type{" "}
            <select value={importType} onChange={(e) => setImportType(e.target.value as ImportType)}>
              {(["revenue", "costs", "invoices", "occupancy"] as ImportType[]).map((t) => (
                <option key={t} value={t}>{typeLabel[t]}</option>
              ))}
            </select>
          </label>
          <label>
            Software{" "}
            <select
              value={software}
              onChange={(e) => {
                const next = e.target.value as Software;
                setSoftware(next);
                if (next === "procountor") void loadPropertiesAndMappings();
              }}
            >
              <option value="generic">Generic CSV / Excel</option>
              <option value="procountor">Procountor</option>
              <option value="netvisor">Netvisor</option>
              <option value="visma">Visma</option>
            </select>
          </label>
          {software === "procountor" ? (
            <>
              <label>
                Procountor export{" "}
                <select value={procountorExportType} onChange={(e) => setProcountorExportType(e.target.value as ProcountorExportType)}>
                  <option value="sales_invoices">Sales invoices (Myyntilaskut)</option>
                  <option value="purchase_invoices">Purchase invoices (Ostolaskut)</option>
                  <option value="general_ledger">General ledger (Pääkirja)</option>
                </select>
              </label>
              <label>
                Date from <input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
              </label>
              <label>
                Date to <input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
              </label>
            </>
          ) : null}
          <label>
            Duplicate mode{" "}
            <select value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value as "skip" | "overwrite" | "merge")}>
              <option value="skip">Skip existing</option>
              <option value="overwrite">Overwrite existing</option>
              <option value="merge">Merge (where supported)</option>
            </select>
          </label>
          <a href={`/api/settings/import/template?type=${importType}`} style={{ paddingTop: 4 }}>
            Download template
          </a>
          <input type="file" accept=".csv,.xlsx" multiple onChange={(e) => void onFiles(e.target.files)} />
          <button
            type="button"
            onClick={() => void importRows(rows, software === "generic" ? "excel" : "accounting_software")}
            disabled={loading || rows.length === 0 || (software === "procountor" && unmappedProcountorCodes.length > 0)}
          >
            {loading ? "Importing..." : "Import preview rows"}
          </button>
        </div>
        {fileName ? <p style={{ margin: 0, fontSize: 13 }}>File(s): {fileName}</p> : null}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void onFiles(e.dataTransfer.files);
          }}
          style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: 10, color: "#475569", fontSize: 12 }}
        >
          Drag and drop one or more CSV/XLSX files here.
        </div>
        {fileNames.length > 1 ? <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>Loaded files: {fileNames.join(", ")}</p> : null}
        {msg ? <p style={{ margin: 0, color: "#1e3a8a" }}>{msg}</p> : null}
        {software === "procountor" && savedMappingsLoaded ? <p style={{ margin: 0, fontSize: 12, color: "#166534" }}>Using saved mapping (review/edit before import).</p> : null}
        {software === "procountor" && unmappedProcountorCodes.length ? (
          <p style={{ margin: 0, color: "#991b1b", fontSize: 12 }}>
            New cost center found: {unmappedProcountorCodes.join(", ")}. Map these before importing.
          </p>
        ) : null}
        {invoiceDuplicateGroups.length ? (
          <div style={{ border: "1px solid #f59e0b", background: "#fffbeb", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
            <strong>Duplicate invoices across files</strong>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => applyBulkDuplicateChoice("first")}>Keep first for all</button>
              <button type="button" onClick={() => applyBulkDuplicateChoice("latest_file")}>Keep latest-file for all</button>
              <button type="button" onClick={() => applyBulkDuplicateChoice("merge_exact")}>Auto-select exact amount matches</button>
              <button type="button" onClick={() => applyBulkDuplicateChoice("clear")}>Clear selections</button>
            </div>
            {invoiceDuplicateGroups.map((g) => (
              <div key={g.key} style={{ border: "1px solid #fde68a", borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, marginBottom: 6 }}>Invoice: {g.key}</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {g.rows.map((r) => {
                    const rowId = String(r.__row_id ?? "");
                    return (
                      <label key={rowId} style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "start" }}>
                        <input
                          type="radio"
                          name={`dup-${g.key}`}
                          checked={invoiceDuplicateChoice[g.key] === rowId}
                          onChange={() => setInvoiceDuplicateChoice((s) => ({ ...s, [g.key]: rowId }))}
                        />
                        <span style={{ fontSize: 12 }}>
                          {String(r.__source_file ?? "unknown file")} | property: {String(r.property ?? "—")} | ex VAT: {String(r.amount_ex_vat ?? "0")} | VAT: {String(r.vat_amount ?? "0")} | total: {String(r.total_amount ?? "0")}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {rows.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {previewHead.map((h) => (
                    <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 12).map((r, i) => (
                  <tr key={i}>
                    {previewHead.map((h) => (
                      <td key={h} style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{String(r[h] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 12 ? <p style={{ fontSize: 12, color: "#64748b" }}>Showing 12 / {rows.length} rows</p> : null}
          </div>
        ) : null}
        {software === "procountor" && procountorCodes.length ? (
          <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
            <strong>Cost center mapping (many Procountor centers can map to one property)</strong>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Procountor cost center</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Maps to property</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Data type</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Category</th>
                    <th style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>Include</th>
                  </tr>
                </thead>
                <tbody>
                  {procountorCodes.map((code) => {
                    const m = costCenterMappings[code] ?? {
                      propertyId: "",
                      dataType: (importType === "costs" ? "cost" : "revenue") as MappingDataType,
                      category: (importType === "costs" ? "one_off_cost" : "office_rent") as RevenueCategory | CostCategory,
                      active: true,
                      name: "",
                    };
                    const categories = m.dataType === "revenue" ? REVENUE_CATEGORIES : COST_CATEGORIES;
                    return (
                      <tr key={code}>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                          <div>{code}</div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            from: {(costCenterSourceFiles[code] ?? []).join(", ") || "unknown"}
                          </div>
                        </td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                          <select
                            value={m.propertyId}
                            onChange={(e) => setCostCenterMappings((s) => ({ ...s, [code]: { ...m, propertyId: e.target.value } }))}
                          >
                            <option value="">Select property...</option>
                            {properties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {(p.name ?? "Property") + (p.city ? ` (${p.city})` : "")}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                          <select
                            value={m.dataType}
                            onChange={(e) =>
                              setCostCenterMappings((s) => ({
                                ...s,
                                [code]: {
                                  ...m,
                                  dataType: e.target.value as MappingDataType,
                                  category: e.target.value === "cost" ? "one_off_cost" : "office_rent",
                                },
                              }))
                            }
                          >
                            <option value="revenue">Revenue</option>
                            <option value="cost">Cost</option>
                          </select>
                        </td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                          <select
                            value={m.category}
                            onChange={(e) => setCostCenterMappings((s) => ({ ...s, [code]: { ...m, category: e.target.value as RevenueCategory | CostCategory } }))}
                          >
                            {categories.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                          <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="checkbox"
                              checked={m.active}
                              onChange={(e) => setCostCenterMappings((s) => ({ ...s, [code]: { ...m, active: e.target.checked } }))}
                            />
                            {m.active ? "Include" : "Ignore"}
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div>
              <button type="button" onClick={() => void saveProcountorMappings()}>
                Save mapping for future imports
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Manual monthly entry</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: 13 }}>
          Use for quick corrections or one-off historical month entry.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
          <input placeholder="Property name" value={manual.property} onChange={(e) => setManual((s) => ({ ...s, property: e.target.value }))} />
          <input placeholder="Year" value={manual.year} onChange={(e) => setManual((s) => ({ ...s, year: e.target.value }))} />
          <input placeholder="Month" value={manual.month} onChange={(e) => setManual((s) => ({ ...s, month: e.target.value }))} />
          {importType === "revenue" ? (
            <>
              <input placeholder="Office revenue" value={manual.office_rent_revenue} onChange={(e) => setManual((s) => ({ ...s, office_rent_revenue: e.target.value }))} />
              <input placeholder="Meeting revenue" value={manual.meeting_room_revenue} onChange={(e) => setManual((s) => ({ ...s, meeting_room_revenue: e.target.value }))} />
              <input placeholder="Hot desk revenue" value={manual.hot_desk_revenue} onChange={(e) => setManual((s) => ({ ...s, hot_desk_revenue: e.target.value }))} />
              <input placeholder="Venue revenue" value={manual.venue_revenue} onChange={(e) => setManual((s) => ({ ...s, venue_revenue: e.target.value }))} />
              <input placeholder="Additional services" value={manual.additional_services_revenue} onChange={(e) => setManual((s) => ({ ...s, additional_services_revenue: e.target.value }))} />
              <input placeholder="Total revenue" value={manual.total_revenue} onChange={(e) => setManual((s) => ({ ...s, total_revenue: e.target.value }))} />
            </>
          ) : null}
          {importType === "costs" ? (
            <>
              <input type="date" value={manual.date} onChange={(e) => setManual((s) => ({ ...s, date: e.target.value }))} />
              <input placeholder="Cost type" value={manual.cost_type} onChange={(e) => setManual((s) => ({ ...s, cost_type: e.target.value }))} />
              <input placeholder="Description" value={manual.description} onChange={(e) => setManual((s) => ({ ...s, description: e.target.value }))} />
              <input placeholder="Amount ex VAT" value={manual.amount_ex_vat} onChange={(e) => setManual((s) => ({ ...s, amount_ex_vat: e.target.value }))} />
              <input placeholder="VAT amount" value={manual.vat_amount} onChange={(e) => setManual((s) => ({ ...s, vat_amount: e.target.value }))} />
              <input placeholder="Total amount" value={manual.total_amount} onChange={(e) => setManual((s) => ({ ...s, total_amount: e.target.value }))} />
              <input placeholder="Supplier" value={manual.supplier} onChange={(e) => setManual((s) => ({ ...s, supplier: e.target.value }))} />
              <input placeholder="Invoice number" value={manual.invoice_number} onChange={(e) => setManual((s) => ({ ...s, invoice_number: e.target.value }))} />
            </>
          ) : null}
          {importType === "invoices" ? (
            <>
              <input placeholder="Invoice number" value={manual.invoice_number} onChange={(e) => setManual((s) => ({ ...s, invoice_number: e.target.value }))} />
              <input type="date" value={manual.date} onChange={(e) => setManual((s) => ({ ...s, date: e.target.value }))} />
              <input type="date" value={manual.due_date} onChange={(e) => setManual((s) => ({ ...s, due_date: e.target.value }))} />
              <input placeholder="Client/Tenant" value={manual.client_tenant} onChange={(e) => setManual((s) => ({ ...s, client_tenant: e.target.value }))} />
              <input placeholder="Amount ex VAT" value={manual.amount_ex_vat} onChange={(e) => setManual((s) => ({ ...s, amount_ex_vat: e.target.value }))} />
              <input placeholder="VAT amount" value={manual.vat_amount} onChange={(e) => setManual((s) => ({ ...s, vat_amount: e.target.value }))} />
              <input placeholder="Total amount" value={manual.total_amount} onChange={(e) => setManual((s) => ({ ...s, total_amount: e.target.value }))} />
              <select value={manual.status} onChange={(e) => setManual((s) => ({ ...s, status: e.target.value }))}>
                <option value="unpaid">unpaid</option>
                <option value="paid">paid</option>
              </select>
              <input type="date" value={manual.payment_date} onChange={(e) => setManual((s) => ({ ...s, payment_date: e.target.value }))} />
            </>
          ) : null}
          {importType === "occupancy" ? (
            <>
              <input placeholder="Total rooms" value={manual.total_rooms} onChange={(e) => setManual((s) => ({ ...s, total_rooms: e.target.value }))} />
              <input placeholder="Occupied rooms" value={manual.occupied_rooms} onChange={(e) => setManual((s) => ({ ...s, occupied_rooms: e.target.value }))} />
              <input placeholder="Occupancy %" value={manual.occupancy_pct} onChange={(e) => setManual((s) => ({ ...s, occupancy_pct: e.target.value }))} />
              <input placeholder="Revenue per m2" value={manual.revenue_per_m2} onChange={(e) => setManual((s) => ({ ...s, revenue_per_m2: e.target.value }))} />
            </>
          ) : null}
        </div>
        <button type="button" onClick={() => void importManual()} disabled={loading}>
          Save manual entry
        </button>
      </section>

      <section style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fff", display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Import history</h2>
        <button type="button" onClick={() => void loadHistory()} style={{ width: "fit-content" }}>Refresh history</button>
        {history.length === 0 ? <p style={{ color: "#64748b" }}>No import batches loaded.</p> : null}
        {history.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Date", "Type", "Source", "File", "Imported", "Failed", "By", "Actions"].map((h) => (
                    <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: 6 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id}>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{new Date(b.created_at).toLocaleString()}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{b.import_type}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{b.source_software ?? "—"}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{b.file_name ?? "—"}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{b.rows_imported}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{b.rows_failed}</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>{b.imported_by.slice(0, 8)}…</td>
                    <td style={{ borderBottom: "1px solid #f1f5f9", padding: 6 }}>
                      <button type="button" onClick={() => void rollback(b.id)}>Rollback</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
