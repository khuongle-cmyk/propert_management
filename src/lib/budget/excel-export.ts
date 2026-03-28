import ExcelJS from "exceljs";
import {
  BUDGET_COST_LABELS,
  BUDGET_COST_TYPES,
  BUDGET_OCCUPANCY_LABELS,
  BUDGET_REVENUE_LABELS,
  BUDGET_REVENUE_CATEGORIES,
  MONTH_SHORT,
} from "./constants";
import type { BudgetRow } from "./server-access";
import {
  aggregateCostByMonth,
  aggregateRevenueByMonth,
  capexCashOutByMonth,
  headcountStaffCostByMonth,
  monthIndexToKey,
  totalCostPerMonth,
  totalRevenuePerMonth,
} from "./aggregates";

type LineRow = Record<string, unknown>;

export async function buildBudgetExcelWorkbook(input: {
  budget: BudgetRow;
  propertyName: string | null;
  revenueLines: LineRow[];
  costLines: LineRow[];
  headcountLines: LineRow[];
  capexLines: LineRow[];
  occupancyLines: LineRow[];
}): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Property management";
  wb.created = new Date();

  const year = input.budget.budget_year;
  const filterPid = input.budget.property_id;

  const revAgg = aggregateRevenueByMonth(
    input.revenueLines as Parameters<typeof aggregateRevenueByMonth>[0],
    year,
    filterPid,
  );
  const staff = headcountStaffCostByMonth(
    input.headcountLines as Parameters<typeof headcountStaffCostByMonth>[0],
    year,
    filterPid,
  );
  const costAgg = aggregateCostByMonth(
    input.costLines as Parameters<typeof aggregateCostByMonth>[0],
    year,
    filterPid,
    staff,
  );
  const revTot = totalRevenuePerMonth(revAgg);
  const costTot = totalCostPerMonth(costAgg);
  const capexMo = capexCashOutByMonth(
    input.capexLines as Parameters<typeof capexCashOutByMonth>[0],
  );

  const overview = wb.addWorksheet("Overview");
  overview.getCell("A1").value = `${input.budget.name} (${year})`;
  overview.getCell("A2").value = input.propertyName ? `Property: ${input.propertyName}` : "Portfolio";
  overview.getRow(4).values = ["", ...MONTH_SHORT, "Total"];
  const totalRevY = Object.values(revTot).reduce((a, b) => a + b, 0);
  const totalCostY = Object.values(costTot).reduce((a, b) => a + b, 0);
  const totalNetY = totalRevY - totalCostY;
  const rowsDef: { label: string; monthVal: (mk: ReturnType<typeof monthIndexToKey>) => number; total: number }[] = [
    { label: "Revenue", monthVal: (mk) => revTot[mk] ?? 0, total: totalRevY },
    { label: "Costs", monthVal: (mk) => costTot[mk] ?? 0, total: totalCostY },
    { label: "Net income", monthVal: (mk) => (revTot[mk] ?? 0) - (costTot[mk] ?? 0), total: totalNetY },
    {
      label: "Margin %",
      monthVal: (mk) => {
        const rev = revTot[mk] ?? 0;
        return rev > 0 ? ((rev - (costTot[mk] ?? 0)) / rev) * 100 : 0;
      },
      total: totalRevY > 0 ? (totalNetY / totalRevY) * 100 : 0,
    },
  ];
  let r = 5;
  for (const def of rowsDef) {
    overview.getCell(`A${r}`).value = def.label;
    for (let m = 1; m <= 12; m++) {
      const mk = monthIndexToKey(m);
      const v = def.monthVal(mk);
      overview.getCell(r, m + 1).value = def.label === "Margin %" ? v / 100 : v;
    }
    overview.getCell(r, 14).value = def.label === "Margin %" ? def.total / 100 : def.total;
    r++;
  }

  function addGridSheet(name: string, categories: string[], labels: Record<string, string>, key: "category" | "cost_type") {
    const ws = wb.addWorksheet(name);
    ws.getRow(1).values = [key === "category" ? "Category" : "Cost type", ...MONTH_SHORT, "Total"];
    let row = 2;
    for (const cat of categories) {
      ws.getCell(`A${row}`).value = labels[cat] ?? cat;
      let t = 0;
      for (let m = 1; m <= 12; m++) {
        const mk = monthIndexToKey(m);
        let v = 0;
        if (key === "category") v = (revAgg as Record<string, Record<string, number>>)[cat]?.[mk] ?? 0;
        else v = (costAgg as Record<string, Record<string, number>>)[cat]?.[mk] ?? 0;
        ws.getCell(row, m + 1).value = v;
        t += v;
      }
      ws.getCell(row, 14).value = t;
      row++;
    }
  }

  addGridSheet(
    "Revenue",
    [...BUDGET_REVENUE_CATEGORIES],
    BUDGET_REVENUE_LABELS as unknown as Record<string, string>,
    "category",
  );
  addGridSheet("Costs", [...BUDGET_COST_TYPES], BUDGET_COST_LABELS as unknown as Record<string, string>, "cost_type");

  const hc = wb.addWorksheet("Headcount");
  hc.getRow(1).values = ["Role", ...MONTH_SHORT, "Annual total"];
  const roles = [...new Set(input.headcountLines.map((l) => String((l as { role_name: string }).role_name ?? "")))];
  let hr = 2;
  for (const role of roles) {
    if (!role) continue;
    hc.getCell(`A${hr}`).value = role;
    let annual = 0;
    for (let m = 1; m <= 12; m++) {
      const line = input.headcountLines.find(
        (l) =>
          String((l as { role_name: string }).role_name) === role &&
          Number((l as { month: number }).month) === m &&
          Number((l as { year: number }).year) === year,
      ) as { headcount?: number; monthly_cost?: number } | undefined;
      const h = line?.headcount ?? 0;
      const c = line?.monthly_cost ?? 0;
      hc.getCell(hr, m + 1).value = `${h} / ${c}`;
      annual += Number(c) || 0;
    }
    hc.getCell(hr, 14).value = annual;
    hr++;
  }

  const cx = wb.addWorksheet("CapEx");
  cx.getRow(1).values = ["Item", "Category", "Planned date", "Estimated", "Actual", "Status", "Notes"];
  let cr = 2;
  for (const row of input.capexLines) {
    const o = row as Record<string, unknown>;
    cx.getRow(cr).values = [
      o.item_name != null ? String(o.item_name) : "",
      o.category != null ? String(o.category) : "",
      o.planned_date != null ? String(o.planned_date) : "",
      Number(o.estimated_cost) || 0,
      Number(o.actual_cost) || 0,
      o.status != null ? String(o.status) : "",
      o.notes != null ? String(o.notes) : "",
    ];
    cr++;
  }

  const occ = wb.addWorksheet("Occupancy");
  occ.getRow(1).values = ["Space type", ...MONTH_SHORT];
  let or = 2;
  const stypes = [...new Set(input.occupancyLines.map((l) => String((l as { space_type: string }).space_type)))];
  for (const st of stypes) {
    occ.getCell(`A${or}`).value = BUDGET_OCCUPANCY_LABELS[st as keyof typeof BUDGET_OCCUPANCY_LABELS] ?? st;
    for (let m = 1; m <= 12; m++) {
      const line = input.occupancyLines.find(
        (l) =>
          String((l as { space_type: string }).space_type) === st &&
          Number((l as { month: number }).month) === m &&
          Number((l as { year: number }).year) === year,
      ) as { target_occupancy_pct?: number } | undefined;
      occ.getCell(or, m + 1).value = line?.target_occupancy_pct ?? null;
    }
    or++;
  }

  const cf = wb.addWorksheet("Cash flow");
  cf.getRow(1).values = ["", ...MONTH_SHORT, "Total"];
  cf.getCell("A2").value = "Revenue";
  cf.getCell("A3").value = "Operating costs";
  cf.getCell("A4").value = "CapEx (cash)";
  cf.getCell("A5").value = "Net cash flow";
  cf.getCell("A6").value = "Closing balance";
  let open = Number(input.budget.opening_cash_balance) || 0;
  for (let m = 1; m <= 12; m++) {
    const mk = monthIndexToKey(m);
    const rev = revTot[mk] ?? 0;
    const op = costTot[mk] ?? 0;
    const cxm = capexMo[mk] ?? 0;
    const net = rev - op - cxm;
    cf.getCell(2, m + 1).value = rev;
    cf.getCell(3, m + 1).value = op;
    cf.getCell(4, m + 1).value = cxm;
    cf.getCell(5, m + 1).value = net;
    open += net;
    cf.getCell(6, m + 1).value = open;
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ExcelJS.Buffer;
}
