import type { BudgetCostType } from "./constants";
import { BUDGET_COST_TYPES } from "./constants";

/** Map historical_costs.cost_type (and legacy values) to budget cost_type. */
export function mapHistoricalCostTypeToBudget(raw: string | null | undefined): BudgetCostType {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if ((BUDGET_COST_TYPES as readonly string[]).includes(t)) return t as BudgetCostType;
  if (t === "one_off" || t === "other_one_off") return "other";
  return "other";
}
