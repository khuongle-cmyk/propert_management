import type { BudgetCostType, BudgetRevenueCategory } from "./constants";
import {
  BUDGET_COST_TYPES,
  BUDGET_REVENUE_CATEGORIES,
  MONTH_SHORT,
} from "./constants";

export type MonthKey = `m${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;

export function monthIndexToKey(m: number): MonthKey {
  if (m < 1 || m > 12) return "m1";
  return `m${m as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`;
}

export function emptyMonthRecord<T extends number>(init: T): Record<MonthKey, T> {
  return {
    m1: init,
    m2: init,
    m3: init,
    m4: init,
    m5: init,
    m6: init,
    m7: init,
    m8: init,
    m9: init,
    m10: init,
    m11: init,
    m12: init,
  };
}

export function sumMonths(rec: Record<MonthKey, number>): number {
  let s = 0;
  for (let i = 1; i <= 12; i++) {
    s += rec[monthIndexToKey(i)] ?? 0;
  }
  return s;
}

/** Portfolio filter: include line if property_id is null (tenant-wide) or matches selected property. */
export function lineMatchesPropertyFilter(propertyId: string | null, filterPropertyId: string | null): boolean {
  if (!filterPropertyId) return true;
  return propertyId === null || propertyId === filterPropertyId;
}

export function aggregateRevenueByMonth(
  lines: Array<{ property_id: string | null; month: number; year: number; category: string; budgeted_amount: number | string | null }>,
  budgetYear: number,
  filterPropertyId: string | null,
): Record<BudgetRevenueCategory, Record<MonthKey, number>> {
  const out = {} as Record<BudgetRevenueCategory, Record<MonthKey, number>>;
  for (const c of BUDGET_REVENUE_CATEGORIES) {
    out[c] = emptyMonthRecord(0);
  }
  for (const row of lines) {
    if (row.year !== budgetYear) continue;
    if (!lineMatchesPropertyFilter(row.property_id, filterPropertyId)) continue;
    if (!BUDGET_REVENUE_CATEGORIES.includes(row.category as BudgetRevenueCategory)) continue;
    const mk = monthIndexToKey(row.month);
    const cat = row.category as BudgetRevenueCategory;
    out[cat][mk] += Number(row.budgeted_amount) || 0;
  }
  return out;
}

export function aggregateCostByMonth(
  lines: Array<{ property_id: string | null; month: number; year: number; cost_type: string; budgeted_amount: number | string | null }>,
  budgetYear: number,
  filterPropertyId: string | null,
  staffOverrideByMonth?: Record<MonthKey, number> | null,
): Record<BudgetCostType, Record<MonthKey, number>> {
  const out = {} as Record<BudgetCostType, Record<MonthKey, number>>;
  for (const c of BUDGET_COST_TYPES) {
    out[c] = emptyMonthRecord(0);
  }
  for (const row of lines) {
    if (row.year !== budgetYear) continue;
    if (!lineMatchesPropertyFilter(row.property_id, filterPropertyId)) continue;
    if (!BUDGET_COST_TYPES.includes(row.cost_type as BudgetCostType)) continue;
    const mk = monthIndexToKey(row.month);
    const ct = row.cost_type as BudgetCostType;
    if (ct === "staff" && staffOverrideByMonth != null) {
      continue;
    }
    out[ct][mk] += Number(row.budgeted_amount) || 0;
  }
  if (staffOverrideByMonth != null) {
    for (let i = 1; i <= 12; i++) {
      const mk = monthIndexToKey(i);
      out.staff[mk] = staffOverrideByMonth[mk] ?? 0;
    }
  }
  return out;
}

export function headcountStaffCostByMonth(
  lines: Array<{ property_id: string | null; month: number; year: number; monthly_cost: number | string | null }>,
  budgetYear: number,
  filterPropertyId: string | null,
): Record<MonthKey, number> {
  const out = emptyMonthRecord(0);
  for (const row of lines) {
    if (row.year !== budgetYear) continue;
    if (!lineMatchesPropertyFilter(row.property_id, filterPropertyId)) continue;
    const mk = monthIndexToKey(row.month);
    out[mk] += Number(row.monthly_cost) || 0;
  }
  return out;
}

export function totalRevenuePerMonth(
  byCat: Record<BudgetRevenueCategory, Record<MonthKey, number>>,
): Record<MonthKey, number> {
  const t = emptyMonthRecord(0);
  for (const c of BUDGET_REVENUE_CATEGORIES) {
    for (let i = 1; i <= 12; i++) {
      const mk = monthIndexToKey(i);
      t[mk] += byCat[c][mk] ?? 0;
    }
  }
  return t;
}

export function totalCostPerMonth(
  byCat: Record<BudgetCostType, Record<MonthKey, number>>,
): Record<MonthKey, number> {
  const t = emptyMonthRecord(0);
  for (const c of BUDGET_COST_TYPES) {
    for (let i = 1; i <= 12; i++) {
      const mk = monthIndexToKey(i);
      t[mk] += byCat[c][mk] ?? 0;
    }
  }
  return t;
}

export function capexCashOutByMonth(
  lines: Array<{ estimated_cost: number | string | null; planned_date: string | null }>,
): Record<MonthKey, number> {
  const out = emptyMonthRecord(0);
  for (const row of lines) {
    const d = row.planned_date;
    if (!d || String(d).length < 7) continue;
    const month = Number(String(d).slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > 12) continue;
    out[monthIndexToKey(month)] += Number(row.estimated_cost) || 0;
  }
  return out;
}

export function quarterKeys(view: "monthly" | "quarterly" | "annual"): { label: string; months: number[] }[] {
  if (view === "monthly") {
    return Array.from({ length: 12 }, (_, i) => ({ label: MONTH_SHORT[i], months: [i + 1] }));
  }
  if (view === "quarterly") {
    return [
      { label: "Q1", months: [1, 2, 3] },
      { label: "Q2", months: [4, 5, 6] },
      { label: "Q3", months: [7, 8, 9] },
      { label: "Q4", months: [10, 11, 12] },
    ];
  }
  return [{ label: "Year", months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }];
}
