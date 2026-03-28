import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHistoricalCostsAsEntries } from "@/lib/reports/historical-costs";
import { costBreakdownFromEntries } from "@/lib/reports/net-income-builder";
import type { PropertyCostBreakdown, PropertyCostEntryRow } from "@/lib/reports/net-income-types";

const PROPERTY_ENTRY_SELECT =
  "id, property_id, cost_type, description, amount, cost_date, period_month, supplier_name, invoice_number, notes, status, source, recurring_template_id";

export type NetIncomeAlignedMonthCosts = {
  totalCosts: number;
  /** staff_costs + staff_benefits buckets — same P&L staff columns as net income (hr_costs % basis). */
  hrStaffBasis: number;
  error: string | null;
};

function sumCostsForProperties(
  costMap: Map<string, { costs: PropertyCostBreakdown; scheduled: number; confirmed: number }>,
  monthKey: string,
  propertyIds: string[],
): { totalCosts: number; hrStaffBasis: number } {
  let totalCosts = 0;
  let hrStaffBasis = 0;
  for (const pid of propertyIds) {
    const row = costMap.get(`${pid}|${monthKey}`);
    if (!row) continue;
    totalCosts += row.costs.total;
    hrStaffBasis += row.costs.staff_costs + row.costs.staff_benefits;
  }
  return { totalCosts, hrStaffBasis };
}

/**
 * Property costs for one calendar month using the same rules as POST /api/reports/net-income:
 * property_cost_entries + loadHistoricalCostsAsEntries (dedupe, scopes), then costBucketForEntry + computeCostsTotal
 * (e.g. 9160 financial income reduces total; account-code buckets match P&L).
 */
export async function loadNetIncomeAlignedCostsForMonth(
  supabase: SupabaseClient,
  monthKey: string,
  propertyIds: string[],
): Promise<NetIncomeAlignedMonthCosts> {
  if (propertyIds.length === 0) {
    return { totalCosts: 0, hrStaffBasis: 0, error: null };
  }

  const monthFirst = `${monthKey}-01`;
  const monthKeys = [monthKey];

  const { rows: historicalEntries, error: hErr } = await loadHistoricalCostsAsEntries(
    supabase,
    propertyIds,
    monthFirst,
    monthFirst,
  );
  if (hErr) {
    return { totalCosts: 0, hrStaffBasis: 0, error: hErr };
  }

  const { data: costRows, error: cErr } = await supabase
    .from("property_cost_entries")
    .select(PROPERTY_ENTRY_SELECT)
    .in("property_id", propertyIds)
    .eq("period_month", monthFirst);

  if (cErr) {
    if (cErr.code === "42P01" || String(cErr.message).includes("property_cost_entries")) {
      const costMap = costBreakdownFromEntries([...historicalEntries], monthKeys, propertyIds);
      const sums = sumCostsForProperties(costMap, monthKey, propertyIds);
      return { ...sums, error: null };
    }
    return { totalCosts: 0, hrStaffBasis: 0, error: cErr.message };
  }

  const entries = (costRows ?? []) as PropertyCostEntryRow[];
  const costMap = costBreakdownFromEntries([...entries, ...historicalEntries], monthKeys, propertyIds);
  const sums = sumCostsForProperties(costMap, monthKey, propertyIds);
  return { ...sums, error: null };
}
