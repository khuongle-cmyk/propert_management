import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyMonthRecord, monthIndexToKey } from "./aggregates";

/** Sum headcount lines by month and replace portfolio-level staff cost lines. */
export async function syncStaffCostLinesFromHeadcount(
  supabase: SupabaseClient,
  budgetId: string,
  budgetYear: number,
  headcountLines: Array<{ month: number; year: number; monthly_cost: number | string | null }>,
): Promise<{ error?: string }> {
  const totals = emptyMonthRecord(0);
  for (const row of headcountLines) {
    if (row.year !== budgetYear) continue;
    const mk = monthIndexToKey(row.month);
    totals[mk] += Number(row.monthly_cost) || 0;
  }

  const { error: delErr } = await supabase
    .from("budget_cost_lines")
    .delete()
    .eq("budget_id", budgetId)
    .eq("year", budgetYear)
    .eq("cost_type", "staff")
    .is("property_id", null);
  if (delErr) return { error: delErr.message };

  const insertRows = [];
  for (let m = 1; m <= 12; m++) {
    const mk = monthIndexToKey(m);
    insertRows.push({
      budget_id: budgetId,
      property_id: null as string | null,
      month: m,
      year: budgetYear,
      cost_type: "staff" as const,
      budgeted_amount: totals[mk] ?? 0,
    });
  }

  const { error: insErr } = await supabase.from("budget_cost_lines").insert(insertRows);
  if (insErr) return { error: insErr.message };
  return {};
}
