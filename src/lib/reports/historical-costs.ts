import type { SupabaseClient } from "@supabase/supabase-js";
import { mapAccountCodeToHistoricalCostType } from "@/lib/reports/net-income-cost-accounts";
import type { PropertyCostEntryRow } from "./net-income-types";

type HistoricalCostRow = {
  id: string;
  property_id: string;
  cost_type: string;
  description: string | null;
  amount_ex_vat: number;
  cost_date: string;
  year: number;
  month: number;
  supplier_name: string | null;
  invoice_number: string | null;
  account_code: string | null;
};

function approxEq(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01;
}

/**
 * Collapse duplicate imports: same property + month + account should not be summed twice
 * when amounts match (re-import / double commit). Different amounts for same account-month are summed.
 */
function dedupeHistoricalCostRows(rows: HistoricalCostRow[]): HistoricalCostRow[] {
  const map = new Map<string, HistoricalCostRow>();
  for (const r of rows) {
    const acct = (r.account_code ?? "").trim();
    const keyAcct = acct || `__type_${r.cost_type}__`;
    const key = `${r.property_id}|${r.year}|${r.month}|${keyAcct}`;
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

export async function loadHistoricalCostsAsEntries(
  supabase: SupabaseClient,
  propertyIds: string[],
  firstMonthDay: string,
  lastMonthDay: string,
): Promise<{ rows: PropertyCostEntryRow[]; error?: string }> {
  const first = new Date(firstMonthDay);
  const last = new Date(lastMonthDay);

  let raw: HistoricalCostRow[] = [];
  const res = await supabase
    .from("historical_costs")
    .select("id, property_id, cost_type, description, amount_ex_vat, cost_date, year, month, supplier_name, invoice_number, account_code")
    .in("property_id", propertyIds)
    .gte("year", first.getUTCFullYear())
    .lte("year", last.getUTCFullYear());

  if (res.error) {
    if (res.error.code === "42P01") return { rows: [] };
    if (res.error.code === "42703") {
      const res2 = await supabase
        .from("historical_costs")
        .select("id, property_id, cost_type, description, amount_ex_vat, cost_date, year, month, supplier_name, invoice_number")
        .in("property_id", propertyIds)
        .gte("year", first.getUTCFullYear())
        .lte("year", last.getUTCFullYear());
      if (res2.error) {
        if (res2.error.code === "42P01") return { rows: [] };
        return { rows: [], error: res2.error.message };
      }
      raw = ((res2.data ?? []) as Omit<HistoricalCostRow, "account_code">[]).map((r) => ({ ...r, account_code: null }));
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

  const deduped = dedupeHistoricalCostRows(inRange);

  const rows: PropertyCostEntryRow[] = deduped.map((r) => ({
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
  }));

  return { rows };
}
