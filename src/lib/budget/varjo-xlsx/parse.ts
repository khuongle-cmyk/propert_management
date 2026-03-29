import type { Cell, Worksheet } from "exceljs";

/** DB revenue `category` values */
export type VarjoRevenueCategory =
  | "office_rent"
  | "meeting_room"
  | "hot_desk"
  | "venue"
  | "virtual_office"
  | "furniture"
  | "additional_services";

/** DB `cost_type` values */
export type VarjoCostType =
  | "cleaning"
  | "utilities"
  | "property_management"
  | "insurance"
  | "security"
  | "it_infrastructure"
  | "marketing"
  | "staff"
  | "capex"
  | "other";

export type MonthValues = { month: number; amount: number }[];

export type ParsedPropertySection = {
  revenue: { category: VarjoRevenueCategory; months: MonthValues }[];
  costs: { costType: VarjoCostType; months: MonthValues }[];
};

export type ParsedPropertySheet = {
  sheetName: string;
  titleRow: string;
  detectedYear: number | null;
  budget: ParsedPropertySection;
  actuals: ParsedPropertySection | null;
};

export type ParsedStaffPerson = {
  name: string;
  months: MonthValues;
};

export type ParsedStaffSheet = {
  sheetName: string;
  kind: "operational_payroll" | "admin_payroll";
  budget: ParsedStaffPerson[];
  actuals: ParsedStaffPerson[];
};

const COL_FIRST_MONTH = 2; // B = January
const COL_LAST_MONTH = 13; // M = December

function normalizeCellText(v: unknown): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read numeric value from cell; supports formula cached result (ExcelJS). */
export function readCellNumber(cell: Cell | undefined): number | null {
  if (!cell || cell.value == null) return null;
  const v = cell.value;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.replace(/\s/g, "").replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v !== null) {
    const o = v as { result?: unknown; richText?: Array<{ text: string }> };
    if ("result" in o && o.result != null) {
      return readCellNumber({ value: o.result } as Cell);
    }
    if (Array.isArray(o.richText)) {
      return readCellNumber({ value: o.richText.map((x) => x.text).join("") } as Cell);
    }
  }
  return null;
}

function readMonthRow(sheet: Worksheet, row: number): MonthValues {
  const out: MonthValues = [];
  let col = COL_FIRST_MONTH;
  for (let m = 1; m <= 12; m++) {
    const n = readCellNumber(sheet.getRow(row).getCell(col));
    out.push({ month: m, amount: n != null && Number.isFinite(n) ? n : 0 });
    col += 1;
  }
  return out;
}

const REV_PATTERNS: { re: RegExp; category: VarjoRevenueCategory }[] = [
  { re: /toimistovuokrat/i, category: "office_rent" },
  { re: /coworking/i, category: "hot_desk" },
  { re: /virtuaali|virtuaalitoimist|virtual\s*office|^address$/i, category: "virtual_office" },
  { re: /lisäpalvelu/i, category: "additional_services" },
  { re: /tapahtumatila|tapahtumatilat/i, category: "venue" },
];

const COST_PATTERNS: { re: RegExp; costType: VarjoCostType }[] = [
  { re: /aine\s*ja\s*tarvike|aineet\s*ja\s*tarvikkeet/i, costType: "other" },
  { re: /^siivous$/i, costType: "cleaning" },
  { re: /data|internet/i, costType: "it_infrastructure" },
  { re: /huolto/i, costType: "property_management" },
  { re: /^henkilöstö$/i, costType: "staff" },
  { re: /toimitilakulut/i, costType: "utilities" },
  { re: /kone\s*ja\s*kalusto|koneet\s*ja\s*kalusto/i, costType: "capex" },
  { re: /^tapahtumat$/i, costType: "marketing" },
  { re: /^hallinto$/i, costType: "property_management" },
  { re: /^vuokra$/i, costType: "utilities" },
];

function parseLabelSection(
  sheet: Worksheet,
  maxRow: number,
  rowStart: number,
): ParsedPropertySection {
  const revenue: ParsedPropertySection["revenue"] = [];
  const costs: ParsedPropertySection["costs"] = [];
  let phase: "seek_rev" | "revenue" | "seek_cost" | "costs" | "done" = "seek_rev";

  for (let r = rowStart; r <= maxRow; r++) {
    const ca = sheet.getRow(r).getCell(1);
    const rawA = normalizeCellText(ca.text ?? ca.value);
    const a = rawA.toLowerCase();

    if (phase === "seek_rev") {
      if (/vuokrat/.test(a) && !/toteuma/.test(a)) phase = "revenue";
      continue;
    }
    if (phase === "revenue") {
      if (/yhteensä|yhteensa/.test(a)) {
        phase = "seek_cost";
        continue;
      }
      for (const { re, category } of REV_PATTERNS) {
        if (re.test(rawA)) {
          const months = readMonthRow(sheet, r);
          if (months.length) revenue.push({ category, months });
          break;
        }
      }
      continue;
    }
    if (phase === "seek_cost") {
      if (/operatiiviset\s*kulut|operating/i.test(a)) phase = "costs";
      continue;
    }
    if (phase === "costs") {
      if (/yhteensä|yhteensa/.test(a)) {
        phase = "done";
        break;
      }
      for (const { re, costType } of COST_PATTERNS) {
        if (re.test(rawA)) {
          const months = readMonthRow(sheet, r);
          if (months.length) costs.push({ costType, months });
          break;
        }
      }
    }
  }

  return { revenue, costs };
}

function findYearFromSheet(sheet: Worksheet): number | null {
  const t1 = normalizeCellText(sheet.getRow(1).getCell(1).text ?? sheet.getRow(1).getCell(1).value);
  const m = t1.match(/(20[2-3]\d)/);
  if (m) return Number(m[1]);
  const m2 = sheet.name.match(/(20[2-3]\d)/);
  return m2 ? Number(m2[1]) : null;
}

/** Split property sheet into budget block (before TOTEUMA) and optional actuals block. */
export function parsePropertySheet(sheet: Worksheet, sheetName: string): ParsedPropertySheet {
  const lastRow = Math.min(sheet.actualRowCount || 200, 400);
  let toteumaRow: number | null = null;
  for (let r = 1; r <= lastRow; r++) {
    const a = normalizeCellText(sheet.getRow(r).getCell(1).text ?? sheet.getRow(r).getCell(1).value).toLowerCase();
    if (a.includes("toteuma")) {
      toteumaRow = r;
      break;
    }
  }

  const titleRow = normalizeCellText(sheet.getRow(1).getCell(1).text ?? sheet.getRow(1).getCell(1).value);
  const detectedYear = findYearFromSheet(sheet);

  const budgetEnd = toteumaRow != null ? toteumaRow - 1 : lastRow;
  const budget = parseLabelSection(sheet, budgetEnd, 1);

  let actuals: ParsedPropertySection | null = null;
  if (toteumaRow != null) {
    actuals = parseLabelSection(sheet, lastRow, toteumaRow);
  }

  return { sheetName, titleRow, detectedYear, budget, actuals };
}

function parseStaffPeopleRange(sheet: Worksheet, rowStart: number, rowEnd: number): ParsedStaffPerson[] {
  const people: ParsedStaffPerson[] = [];
  for (let r = rowStart; r <= rowEnd; r++) {
    const nameCell = sheet.getRow(r).getCell(2);
    const name = normalizeCellText(nameCell.text ?? nameCell.value);
    if (!name || /^name|nim/i.test(name) || /^yhteensä/i.test(name) || /^total/i.test(name)) continue;
    if (/toteuma/i.test(name)) continue;

    const months: MonthValues = [];
    let col = 3;
    for (let m = 1; m <= 12; m++) {
      const num = readCellNumber(sheet.getRow(r).getCell(col));
      months.push({ month: m, amount: num != null && Number.isFinite(num) ? num : 0 });
      col += 1;
    }
    if (months.some((x) => x.amount !== 0)) {
      people.push({ name, months });
    }
  }
  return people;
}

export function parseStaffSheet(sheet: Worksheet, sheetName: string): ParsedStaffSheet | null {
  const n = sheetName.toLowerCase();
  let kind: ParsedStaffSheet["kind"] | null = null;
  if (n.includes("hallinnon") && n.includes("palkka")) kind = "admin_payroll";
  else if ((n.includes("operatiiv") || n.includes("operational")) && n.includes("palkka")) kind = "operational_payroll";
  else if (n.includes("palkkabudjetti")) kind = "operational_payroll";

  if (!kind) return null;

  const lastRow = Math.min(sheet.actualRowCount || 300, 500);
  let toteumaRow: number | null = null;
  for (let r = 2; r <= lastRow; r++) {
    const cx = sheet.getRow(r).getCell(1);
    const a = normalizeCellText(cx.text ?? cx.value).toLowerCase();
    if (a.includes("toteuma")) {
      toteumaRow = r;
      break;
    }
  }

  const budget = parseStaffPeopleRange(sheet, 2, toteumaRow != null ? toteumaRow - 1 : lastRow);
  const actuals =
    toteumaRow != null ? parseStaffPeopleRange(sheet, toteumaRow + 1, lastRow) : [];

  if (budget.length === 0 && actuals.length === 0) return null;

  return { sheetName, kind, budget, actuals };
}

export const VARJO_SKIP_SHEET_SUBSTRINGS = ["sörnäinen", "sornainen", "suomitalo", "vw yhteensä"];

export function shouldSkipSheetName(name: string): boolean {
  const l = name.toLowerCase().trim();
  if (!l) return true;
  return VARJO_SKIP_SHEET_SUBSTRINGS.some((s) => l.includes(s));
}

export type PropertyMatchRule = {
  id: string;
  sheetTokens: string[];
  propertyNameSubstrings: string[];
};

/** Match workbook sheet + title to a property row from DB. */
export function matchPropertyId(
  sheetName: string,
  titleRow: string,
  properties: Array<{ id: string; name: string | null }>,
): string | null {
  const blob = `${sheetName} ${titleRow}`.toUpperCase().replace(/\s+/g, " ");

  const rules: Omit<PropertyMatchRule, "id">[] = [
    {
      sheetTokens: ["E2", "EROTTAJA", "EROTTAJA2"],
      propertyNameSubstrings: ["EROTTAJA", "EROTTAAJA"],
    },
    {
      sheetTokens: ["FREDA", "FREDRIKINKATU"],
      propertyNameSubstrings: ["FREDA"],
    },
    {
      sheetTokens: ["RUOHOLAHTI", "P5"],
      propertyNameSubstrings: ["RUOHOLAHTI", "P5"],
    },
    {
      sheetTokens: ["SÄHKÖTALO", "SAHKOTALO", "SÄHKIS", "SAHKIS"],
      propertyNameSubstrings: ["SÄHK", "SAHK", "SÄHKÖ"],
    },
    {
      sheetTokens: ["SKY", "SKYLOUNGE", "SKY LOUNGE"],
      propertyNameSubstrings: ["SKY"],
    },
  ];

  for (const p of properties) {
    const pn = (p.name ?? "").toUpperCase().replace(/\s+/g, " ");
    if (!pn) continue;
    for (const rule of rules) {
      const sheetHit = rule.sheetTokens.some((t) => blob.includes(t));
      const nameHit = rule.propertyNameSubstrings.some((s) => pn.includes(s));
      if (sheetHit && nameHit) return p.id;
    }
  }

  for (const p of properties) {
    const pn = (p.name ?? "").toUpperCase();
    if (!pn) continue;
    const short = sheetName.toUpperCase().replace(/\s+/g, "");
    if (short.length >= 3 && pn.includes(short)) return p.id;
    if (pn.length >= 4 && blob.includes(pn.slice(0, Math.min(12, pn.length)))) return p.id;
  }

  return null;
}
