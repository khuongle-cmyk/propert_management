import { emptyMonthRecord, monthIndexToKey } from "./aggregates";

export type BudgetLinesBundle = {
  budget: { id: string; budget_year: number; budget_scope: string; property_id: string | null; name: string };
  revenueLines: Array<{ month: number; year: number; category: string; budgeted_amount: number | string | null }>;
  costLines: Array<{ month: number; year: number; cost_type: string; budgeted_amount: number | string | null }>;
  capexLines: Array<{ estimated_cost: number | string | null; planned_date: string | null }>;
};

function n(v: unknown): number {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function sumLineYear(
  lines: Array<{ month: number; year: number; budgeted_amount: number | string | null }>,
  year: number,
): number {
  let s = 0;
  for (const row of lines) {
    if (n(row.year) !== year) continue;
    s += n(row.budgeted_amount);
  }
  return s;
}

function sumCapexYear(lines: BudgetLinesBundle["capexLines"], year: number): number {
  let s = 0;
  for (const row of lines) {
    const d = row.planned_date;
    if (!d || String(d).length < 4) continue;
    const y = Number(String(d).slice(0, 4));
    if (y !== year) continue;
    s += n(row.estimated_cost);
  }
  return s;
}

/** Map operating cost_type lines into administration UI buckets (annual). */
export function administrationCostBucketsAnnual(
  costLines: BudgetLinesBundle["costLines"],
  year: number,
): { centralStaff: number; centralMarketing: number; centralIt: number; insurance: number; otherAdmin: number; total: number } {
  let centralStaff = 0;
  let centralMarketing = 0;
  let centralIt = 0;
  let insurance = 0;
  let otherAdmin = 0;
  for (const row of costLines) {
    if (n(row.year) !== year) continue;
    const amt = n(row.budgeted_amount);
    const ct = String(row.cost_type ?? "");
    if (ct === "staff") centralStaff += amt;
    else if (ct === "marketing") centralMarketing += amt;
    else if (ct === "it_infrastructure") centralIt += amt;
    else if (ct === "insurance") insurance += amt;
    else otherAdmin += amt;
  }
  const total = centralStaff + centralMarketing + centralIt + insurance + otherAdmin;
  return { centralStaff, centralMarketing, centralIt, insurance, otherAdmin, total };
}

export type ConsolidatedAnnualPL = {
  year: number;
  propertyRevenueByPropertyId: Record<string, number>;
  propertyCostsByPropertyId: Record<string, number>;
  totalPropertyRevenue: number;
  totalPropertyCosts: number;
  propertyNoi: number;
  adminCostBuckets: ReturnType<typeof administrationCostBucketsAnnual>;
  propertyCapexTotal: number;
  adminCapexTotal: number;
  totalCapex: number;
  netBeforeCapex: number;
  netIncome: number;
  netMarginPct: number | null;
};

/**
 * Sum selected property budgets + optional administration budget for one calendar year (all months).
 */
export function buildConsolidatedAnnualPL(year: number, bundles: BudgetLinesBundle[]): ConsolidatedAnnualPL {
  const propertyRevenueByPropertyId: Record<string, number> = {};
  const propertyCostsByPropertyId: Record<string, number> = {};
  let adminCostLines: BudgetLinesBundle["costLines"] = [];
  let adminCapexTotal = 0;
  let propertyCapexTotal = 0;

  for (const b of bundles) {
    const scope = String(b.budget.budget_scope ?? "property");
    const pid = b.budget.property_id;
    if (scope === "administration") {
      adminCostLines = [...adminCostLines, ...b.costLines];
      adminCapexTotal += sumCapexYear(b.capexLines, year);
      continue;
    }
    if (scope === "property" && pid) {
      propertyRevenueByPropertyId[pid] = (propertyRevenueByPropertyId[pid] ?? 0) + sumLineYear(b.revenueLines, year);
      propertyCostsByPropertyId[pid] = (propertyCostsByPropertyId[pid] ?? 0) + sumLineYear(b.costLines, year);
      propertyCapexTotal += sumCapexYear(b.capexLines, year);
    }
  }

  const totalPropertyRevenue = Object.values(propertyRevenueByPropertyId).reduce((a, x) => a + x, 0);
  const totalPropertyCosts = Object.values(propertyCostsByPropertyId).reduce((a, x) => a + x, 0);
  const propertyNoi = totalPropertyRevenue - totalPropertyCosts;
  const adminCostBuckets = administrationCostBucketsAnnual(adminCostLines, year);
  const totalCapex = propertyCapexTotal + adminCapexTotal;
  const netBeforeCapex = propertyNoi - adminCostBuckets.total;
  const netIncome = netBeforeCapex - totalCapex;
  const netMarginPct = totalPropertyRevenue > 0 ? (netIncome / totalPropertyRevenue) * 100 : null;

  return {
    year,
    propertyRevenueByPropertyId,
    propertyCostsByPropertyId,
    totalPropertyRevenue,
    totalPropertyCosts,
    propertyNoi,
    adminCostBuckets,
    propertyCapexTotal,
    adminCapexTotal,
    totalCapex,
    netBeforeCapex,
    netIncome,
    netMarginPct,
  };
}

/** Per-month consolidated totals for charts (property NOI vs admin). */
export function buildConsolidatedMonthlySeries(
  year: number,
  bundles: BudgetLinesBundle[],
): Array<{ month: number; revenue: number; propertyCosts: number; adminCosts: number; capex: number }> {
  const propRev = emptyMonthRecord(0);
  const propCost = emptyMonthRecord(0);
  const admCost = emptyMonthRecord(0);
  const capexM = emptyMonthRecord(0);

  for (const b of bundles) {
    const scope = String(b.budget.budget_scope ?? "property");
    for (const row of b.revenueLines) {
      if (n(row.year) !== year) continue;
      const m = n(row.month);
      if (m < 1 || m > 12) continue;
      if (scope === "property") {
        propRev[monthIndexToKey(m)] += n(row.budgeted_amount);
      }
    }
    for (const row of b.costLines) {
      if (n(row.year) !== year) continue;
      const m = n(row.month);
      if (m < 1 || m > 12) continue;
      const mk = monthIndexToKey(m);
      if (scope === "administration") admCost[mk] += n(row.budgeted_amount);
      else if (scope === "property") propCost[mk] += n(row.budgeted_amount);
    }
    for (const row of b.capexLines) {
      const d = row.planned_date;
      if (!d || String(d).length < 7) continue;
      const y = Number(String(d).slice(0, 4));
      if (y !== year) continue;
      const m = Number(String(d).slice(5, 7));
      if (m < 1 || m > 12) continue;
      capexM[monthIndexToKey(m)] += n(row.estimated_cost);
    }
  }

  const out: Array<{ month: number; revenue: number; propertyCosts: number; adminCosts: number; capex: number }> = [];
  for (let m = 1; m <= 12; m++) {
    const mk = monthIndexToKey(m);
    out.push({
      month: m,
      revenue: propRev[mk] ?? 0,
      propertyCosts: propCost[mk] ?? 0,
      adminCosts: admCost[mk] ?? 0,
      capex: capexM[mk] ?? 0,
    });
  }
  return out;
}
