import type { PropertyCostBreakdown } from "@/lib/reports/net-income-types";

/**
 * Portfolio cost table columns — short headers (≤12 chars), one row.
 * Mapped from net-income {@link PropertyCostBreakdown} buckets so column sums equal {@link PropertyCostBreakdown.total}
 * (same rules as computeCostsTotal: e.g. 9160 → financial_income reduces via "Other").
 */
export const SIMPLIFIED_COST_COLUMN_KEYS = [
  "rent",
  "staff",
  "subcontracting",
  "premises",
  "cleaning",
  "utilities",
  "marketing",
  "admin",
  "other",
] as const;

export type SimplifiedCostColumnKey = (typeof SIMPLIFIED_COST_COLUMN_KEYS)[number];

export type SimplifiedPortfolioCostAmounts = Record<SimplifiedCostColumnKey, number> & { total: number };

/** Header labels for UI (all ≤ 12 characters). */
export const SIMPLIFIED_COST_HEADERS: Record<SimplifiedCostColumnKey | "month" | "total", string> = {
  month: "Month",
  rent: "Rent",
  staff: "Staff",
  subcontracting: "Subcontract", // 10
  premises: "Premises",
  cleaning: "Cleaning",
  utilities: "Utilities",
  marketing: "Marketing",
  admin: "Admin",
  other: "Other",
  total: "Total",
};

/**
 * Rent: rent (e.g. 4500). Staff: staff_costs + staff_benefits (5000–7170 band).
 * Subcontracting: subcontracting bucket (4450s / property_management). Premises: premises_costs (449x–4610 band).
 * Cleaning: purchases (4000s, 4491). Utilities: electricity + equipment (4501, IT). Marketing: marketing + sales.
 * Admin: accounting + admin. Other: travel, other, financial_costs − financial_income (9160 offset).
 */
export function simplifiedPortfolioCostsFromBreakdown(c: PropertyCostBreakdown): SimplifiedPortfolioCostAmounts {
  return {
    rent: c.rent,
    staff: c.staff_costs + c.staff_benefits,
    subcontracting: c.subcontracting,
    premises: c.premises_costs,
    cleaning: c.purchases,
    utilities: c.electricity + c.equipment_costs,
    marketing: c.marketing + c.sales_costs,
    admin: c.accounting_fees + c.admin_costs,
    other: c.travel + c.other + c.financial_costs - c.financial_income,
    total: c.total,
  };
}
