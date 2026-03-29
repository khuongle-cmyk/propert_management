import type { ParsedPropertySection, VarjoCostType, VarjoRevenueCategory } from "./parse";

export type MergedRevenueRow = {
  category: VarjoRevenueCategory;
  month: number;
  budgeted_amount: number;
  actual_amount: number;
};

export type MergedCostRow = {
  costType: VarjoCostType;
  month: number;
  budgeted_amount: number;
  actual_amount: number;
};

export type VarjoImportMode = "budget" | "actuals" | "both";

/** Combine budget + toteuma sections into rows for DB (12 months × categories). */
export function mergePropertySections(
  budget: ParsedPropertySection,
  actuals: ParsedPropertySection | null,
  mode: VarjoImportMode,
): { revenue: MergedRevenueRow[]; costs: MergedCostRow[] } {
  const revMap = new Map<string, { category: VarjoRevenueCategory; month: number; bud: number; act: number }>();
  const costMap = new Map<string, { costType: VarjoCostType; month: number; bud: number; act: number }>();

  function bumpRev(category: VarjoRevenueCategory, month: number, bud: number, act: number) {
    const k = `${category}:${month}`;
    const cur = revMap.get(k) ?? { category, month, bud: 0, act: 0 };
    cur.bud += bud;
    cur.act += act;
    revMap.set(k, cur);
  }

  function bumpCost(costType: VarjoCostType, month: number, bud: number, act: number) {
    const k = `${costType}:${month}`;
    const cur = costMap.get(k) ?? { costType, month, bud: 0, act: 0 };
    cur.bud += bud;
    cur.act += act;
    costMap.set(k, cur);
  }

  if (mode !== "actuals") {
    for (const line of budget.revenue) {
      for (const { month, amount } of line.months) {
        bumpRev(line.category, month, amount, 0);
      }
    }
    for (const line of budget.costs) {
      for (const { month, amount } of line.months) {
        bumpCost(line.costType, month, amount, 0);
      }
    }
  }

  if (mode !== "budget" && actuals) {
    for (const line of actuals.revenue) {
      for (const { month, amount } of line.months) {
        bumpRev(line.category, month, 0, amount);
      }
    }
    for (const line of actuals.costs) {
      for (const { month, amount } of line.months) {
        bumpCost(line.costType, month, 0, amount);
      }
    }
  }

  const revenue: MergedRevenueRow[] = [...revMap.values()].map((v) => ({
    category: v.category,
    month: v.month,
    budgeted_amount: v.bud,
    actual_amount: v.act,
  }));

  const costs: MergedCostRow[] = [...costMap.values()].map((v) => ({
    costType: v.costType,
    month: v.month,
    budgeted_amount: v.bud,
    actual_amount: v.act,
  }));

  return { revenue, costs };
}
