import type { SupabaseClient } from "@supabase/supabase-js";
import { mapAccountCodeToHistoricalCostType } from "@/lib/reports/net-income-cost-accounts";
import type { PropertyCostEntryRow } from "./net-income-types";

type HistoricalCostRow = {
  id: string;
  property_id: string | null;
  tenant_id?: string;
  cost_type: string;
  description: string | null;
  amount_ex_vat: number;
  cost_date: string;
  year: number;
  month: number;
  supplier_name: string | null;
  invoice_number: string | null;
  account_code: string | null;
  cost_scope?: string | null;
};

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

function dedupeHistoricalCostRows(rows: HistoricalCostRow[]): HistoricalCostRow[] {
  const map = new Map<string, HistoricalCostRow>();
  for (const r of rows) {
    const acct = (r.account_code ?? "").trim();
    const keyAcct = acct || `__type_${r.cost_type}__`;
    const propPart = r.property_id ?? "__admin__";
    const key = `${propPart}|${r.year}|${r.month}|${keyAcct}|${r.cost_scope ?? "property"}`;
    const existing = map.get(key);
    const amt = Number(r.amount_ex_vat) || 0;
    if (!existing) {
      map.set(key, { ...r, amount_ex_vat: amt });
      continue;
    }
    const prev = Number(existing.amount_ex_vat) || 0;
    if (approxEq(prev, amt)) {
      continue;
    }
    map.set(key, { ...existing, amount_ex_vat: prev + amt });
  }
  return [...map.values()];
}

function syntheticCostTypeForHistorical(accountCode: string | null, costType: string): string {
  const acct = (accountCode ?? "").trim();
  if (acct) return mapAccountCodeToHistoricalCostType(acct);
  return costType;
}

function rowToEntry(r: HistoricalCostRow, cost_scope: "property" | "administration"): PropertyCostEntryRow {
  return {
    id: `hist-${r.id}`,
    property_id: r.property_id,
    cost_type: syntheticCostTypeForHistorical(r.account_code, r.cost_type),
    description: r.description ?? "Historical import",
    amount: Number(r.amount_ex_vat) || 0,
    cost_date: r.cost_date,
    period_month: `${r.year}-${String(r.month).padStart(2, "0")}-01`,
    supplier_name: r.supplier_name,
    invoice_number: r.invoice_number,
    notes: "Historical import",
    status: "confirmed" as const,
    source: "csv" as const,
    recurring_template_id: null,
    account_code: r.account_code ?? null,
    cost_scope,
  };
}

/**
 * Property-attributed historical costs (excludes administration / org-central rows).
 */
export async function loadHistoricalCostsAsEntries(
  supabase: SupabaseClient,
  propertyIds: string[],
  firstMonthDay: string,
  lastMonthDay: string,
): Promise<{ rows: PropertyCostEntryRow[]; error?: string }> {
  if (propertyIds.length === 0) return { rows: [] };

  const first = new Date(firstMonthDay);
  const last = new Date(lastMonthDay);

  let raw: HistoricalCostRow[] = [];
  const baseSelect =
    "id, property_id, tenant_id, cost_type, description, amount_ex_vat, cost_date, year, month, supplier_name, invoice_number, account_code, cost_scope";

  const res = await supabase
    .from("historical_costs")
    .select(baseSelect)
    .in("property_id", propertyIds)
    .gte("year", first.getUTCFullYear())
    .lte("year", last.getUTCFullYear());

  if (res.error) {
    if (res.error.code === "42P01") return { rows: [] };
    if (res.error.code === "42703") {
      const res2 = await supabase
        .from("historical_costs")
        .select(
          "id, property_id, tenant_id, cost_type, description, amount_ex_vat, cost_date, year, month, supplier_name, invoice_number, account_code",
        )
        .in("property_id", propertyIds)
        .gte("year", first.getUTCFullYear())
        .lte("year", last.getUTCFullYear());
      if (res2.error) {
        if (res2.error.code === "42P01") return { rows: [] };
        return { rows: [], error: res2.error.message };
      }
      raw = ((res2.data ?? []) as HistoricalCostRow[]).map((r) => ({ ...r, cost_scope: "property" }));
    } else {
      return { rows: [], error: res.error.message };
    }
  } else {
    raw = (res.data ?? []) as HistoricalCostRow[];
  }

  const inRange = raw.filter((r) => {
    const mk = `${r.year}-${String(r.month).padStart(2, "0")}-01`;
    return mk >= firstMonthDay && mk <= lastMonthDay;
  });

  const propertyOnly = inRange.filter((r) => {
    const cs = (r.cost_scope ?? "property").toLowerCase();
    return cs !== "administration" && r.property_id != null;
  });

  const deduped = dedupeHistoricalCostRows(propertyOnly);
  return { rows: deduped.map((r) => rowToEntry(r, "property")) };
}

/**
 * Organization administration costs (property_id NULL or cost_scope administration).
 */
export async function loadHistoricalAdminCostsAsEntries(
  supabase: SupabaseClient,
  tenantId: string,
  firstMonthDay: string,
  lastMonthDay: string,
): Promise<{ rows: PropertyCostEntryRow[]; error?: string }> {
  const first = new Date(firstMonthDay);
  const last = new Date(lastMonthDay);

  const baseSelect =
    "id, property_id, tenant_id, cost_type, description, amount_ex_vat, cost_date, year, month, supplier_name, invoice_number, account_code, cost_scope";

  const res = await supabase
    .from("historical_costs")
    .select(baseSelect)
    .eq("tenant_id", tenantId)
    .gte("year", first.getUTCFullYear())
    .lte("year", last.getUTCFullYear());

  if (res.error) {
    if (res.error.code === "42P01") return { rows: [] };
    if (res.error.code === "42703") {
      return { rows: [] };
    }
    return { rows: [], error: res.error.message };
  }

  const raw = (res.data ?? []) as HistoricalCostRow[];
  const inRange = raw.filter((r) => {
    const mk = `${r.year}-${String(r.month).padStart(2, "0")}-01`;
    return mk >= firstMonthDay && mk <= lastMonthDay;
  });

  const adminRows = inRange.filter((r) => {
    const cs = (r.cost_scope ?? "").toLowerCase();
    if (cs === "administration") return true;
    return r.property_id == null && cs !== "property";
  });

  const deduped = dedupeHistoricalCostRows(adminRows);
  return { rows: deduped.map((r) => rowToEntry(r, "administration")) };
}
