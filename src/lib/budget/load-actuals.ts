import type { SupabaseClient } from "@supabase/supabase-js";
import type { BudgetCostType, BudgetRevenueCategory } from "./constants";
import { BUDGET_COST_TYPES, BUDGET_REVENUE_CATEGORIES } from "./constants";
import { emptyMonthRecord, monthIndexToKey, type MonthKey } from "./aggregates";
import { mapHistoricalCostTypeToBudget } from "./map-historical-cost";

type RevRow = {
  property_id: string;
  year: number;
  month: number;
  office_rent_revenue: number | string | null;
  meeting_room_revenue: number | string | null;
  hot_desk_revenue: number | string | null;
  venue_revenue: number | string | null;
  virtual_office_revenue: number | string | null;
  furniture_revenue: number | string | null;
  additional_services_revenue: number | string | null;
};

type CostRow = {
  property_id: string;
  year: number;
  month: number;
  amount_ex_vat: number | string | null;
  cost_type: string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type BudgetActualsBundle = {
  revenueByCategoryMonth: Record<BudgetRevenueCategory, Record<MonthKey, number>>;
  costByTypeMonth: Record<BudgetCostType, Record<MonthKey, number>>;
  leaseInvoiceTotalByMonth: Record<MonthKey, number>;
  bookingRevenueByMonth: Record<MonthKey, number>;
};

export async function loadBudgetActuals(
  supabase: SupabaseClient,
  propertyIds: string[],
  year: number,
): Promise<{ bundle: BudgetActualsBundle; errors: string[] }> {
  const errors: string[] = [];
  const revenueByCategoryMonth = {} as Record<BudgetRevenueCategory, Record<MonthKey, number>>;
  for (const c of BUDGET_REVENUE_CATEGORIES) revenueByCategoryMonth[c] = emptyMonthRecord(0);

  const costByTypeMonth = {} as Record<BudgetCostType, Record<MonthKey, number>>;
  for (const c of BUDGET_COST_TYPES) costByTypeMonth[c] = emptyMonthRecord(0);

  const leaseInvoiceTotalByMonth = emptyMonthRecord(0);
  const bookingRevenueByMonth = emptyMonthRecord(0);

  if (propertyIds.length === 0) {
    return {
      bundle: { revenueByCategoryMonth, costByTypeMonth, leaseInvoiceTotalByMonth, bookingRevenueByMonth },
      errors,
    };
  }

  const { data: revRows, error: rErr } = await supabase
    .from("historical_revenue")
    .select(
      "property_id, year, month, office_rent_revenue, meeting_room_revenue, hot_desk_revenue, venue_revenue, virtual_office_revenue, furniture_revenue, additional_services_revenue",
    )
    .in("property_id", propertyIds)
    .eq("year", year);
  if (rErr && rErr.code !== "42P01") errors.push(rErr.message);
  else {
    for (const row of (revRows ?? []) as RevRow[]) {
      const mk = monthIndexToKey(row.month);
      revenueByCategoryMonth.office_rent[mk] += num(row.office_rent_revenue);
      revenueByCategoryMonth.meeting_room[mk] += num(row.meeting_room_revenue);
      revenueByCategoryMonth.hot_desk[mk] += num(row.hot_desk_revenue);
      revenueByCategoryMonth.venue[mk] += num(row.venue_revenue);
      revenueByCategoryMonth.virtual_office[mk] += num(row.virtual_office_revenue);
      revenueByCategoryMonth.furniture[mk] += num(row.furniture_revenue);
      revenueByCategoryMonth.additional_services[mk] += num(row.additional_services_revenue);
    }
  }

  const { data: costRows, error: cErr } = await supabase
    .from("historical_costs")
    .select("property_id, year, month, amount_ex_vat, cost_type")
    .in("property_id", propertyIds)
    .eq("year", year);
  if (cErr && cErr.code !== "42P01") errors.push(cErr.message);
  else {
    for (const row of (costRows ?? []) as CostRow[]) {
      const mk = monthIndexToKey(row.month);
      const bucket = mapHistoricalCostTypeToBudget(row.cost_type);
      costByTypeMonth[bucket][mk] += num(row.amount_ex_vat);
    }
  }

  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const { data: inv, error: iErr } = await supabase
    .from("lease_invoices")
    .select("property_id, billing_month, total_amount")
    .in("property_id", propertyIds)
    .gte("billing_month", yStart)
    .lte("billing_month", yEnd);
  if (iErr && iErr.code !== "42P01") errors.push(iErr.message);
  else {
    for (const row of inv ?? []) {
      const bm = String((row as { billing_month: string }).billing_month ?? "");
      const month = Number(bm.slice(5, 7));
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      leaseInvoiceTotalByMonth[monthIndexToKey(month)] += num((row as { total_amount: unknown }).total_amount);
    }
  }

  const startIso = new Date(Date.UTC(year, 0, 1)).toISOString();
  const endIso = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString();
  const { data: books, error: bErr } = await supabase
    .from("bookings")
    .select("property_id, start_at, total_price, status")
    .in("property_id", propertyIds)
    .gte("start_at", startIso)
    .lte("start_at", endIso);
  if (bErr && bErr.code !== "42P01") errors.push(bErr.message);
  else {
    for (const row of books ?? []) {
      const st = String((row as { status: string | null }).status ?? "").toLowerCase();
      if (st && st !== "confirmed" && st !== "completed") continue;
      const start = (row as { start_at: string }).start_at;
      const d = new Date(start);
      if (Number.isNaN(d.getTime())) continue;
      const month = d.getUTCMonth() + 1;
      bookingRevenueByMonth[monthIndexToKey(month)] += num((row as { total_price: unknown }).total_price);
    }
  }

  return {
    bundle: { revenueByCategoryMonth, costByTypeMonth, leaseInvoiceTotalByMonth, bookingRevenueByMonth },
    errors,
  };
}
