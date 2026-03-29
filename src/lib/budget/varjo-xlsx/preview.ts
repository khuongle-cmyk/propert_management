import type { VarjoImportMode } from "./merge-sections";
import { mergePropertySections } from "./merge-sections";
import type { VarjoWorkbookParse } from "./parse-workbook";

export type VarjoPreviewRow = {
  property: string;
  month: number;
  budgetRevenue: number;
  budgetCosts: number;
  actualRevenue: number;
  actualCosts: number;
  staffMonthlyCost: number;
  staffActualCost: number;
};

/** Aggregate per property × month for preview table. */
export function buildVarjoPreviewRows(parsed: VarjoWorkbookParse, mode: VarjoImportMode): VarjoPreviewRow[] {
  const rows: VarjoPreviewRow[] = [];

  for (const sheet of parsed.propertySheets) {
    const label = sheet.matchedPropertyName ?? sheet.sheetName;
    if (sheet.status !== "mapped") continue;

    const { revenue, costs } = mergePropertySections(sheet.budget, sheet.actuals, mode);
    const agg = new Map<number, { budgetRevenue: number; budgetCosts: number; actualRevenue: number; actualCosts: number }>();
    for (let m = 1; m <= 12; m++) {
      agg.set(m, { budgetRevenue: 0, budgetCosts: 0, actualRevenue: 0, actualCosts: 0 });
    }
    for (const r of revenue) {
      const cell = agg.get(r.month)!;
      cell.budgetRevenue += r.budgeted_amount;
      cell.actualRevenue += r.actual_amount;
    }
    for (const c of costs) {
      const cell = agg.get(c.month)!;
      cell.budgetCosts += c.budgeted_amount;
      cell.actualCosts += c.actual_amount;
    }
    for (let m = 1; m <= 12; m++) {
      const x = agg.get(m)!;
      rows.push({
        property: label,
        month: m,
        budgetRevenue: x.budgetRevenue,
        budgetCosts: x.budgetCosts,
        actualRevenue: x.actualRevenue,
        actualCosts: x.actualCosts,
        staffMonthlyCost: 0,
        staffActualCost: 0,
      });
    }
  }

  if (parsed.staffSheets.length) {
    const staffByMonth = new Map<number, { bud: number; act: number }>();
    for (let m = 1; m <= 12; m++) staffByMonth.set(m, { bud: 0, act: 0 });
    for (const sh of parsed.staffSheets) {
      for (const p of sh.budget) {
        for (const { month, amount } of p.months) {
          const c = staffByMonth.get(month)!;
          c.bud += amount;
        }
      }
      for (const p of sh.actuals) {
        for (const { month, amount } of p.months) {
          const c = staffByMonth.get(month)!;
          c.act += amount;
        }
      }
    }
    for (let m = 1; m <= 12; m++) {
      const x = staffByMonth.get(m)!;
      rows.push({
        property: "Staff (admin / payroll sheets)",
        month: m,
        budgetRevenue: 0,
        budgetCosts: 0,
        actualRevenue: 0,
        actualCosts: 0,
        staffMonthlyCost: mode === "actuals" ? 0 : x.bud,
        staffActualCost: mode === "budget" ? 0 : mode === "actuals" ? x.act || x.bud : x.act,
      });
    }
  }

  return rows;
}
