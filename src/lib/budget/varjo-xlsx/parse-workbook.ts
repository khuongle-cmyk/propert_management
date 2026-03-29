import type { ParsedPropertySheet, ParsedStaffSheet } from "./parse";
import { matchPropertyId, parsePropertySheet, parseStaffSheet, shouldSkipSheetName } from "./parse";

export type VarjoPropertySheetResult = ParsedPropertySheet & {
  propertyId: string | null;
  matchedPropertyName: string | null;
  status: "mapped" | "unmapped" | "skipped_layout";
};

export type VarjoWorkbookParse = {
  fileName: string;
  detectedYear: number | null;
  propertySheets: VarjoPropertySheetResult[];
  staffSheets: ParsedStaffSheet[];
  skippedSheets: string[];
  warnings: string[];
};

export async function parseVarjoWorkbookBuffer(fileName: string, buffer: ArrayBuffer, tenantPropertyRows: Array<{ id: string; name: string | null }>): Promise<VarjoWorkbookParse> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const propertySheets: VarjoPropertySheetResult[] = [];
  const staffSheets: ParsedStaffSheet[] = [];
  const skippedSheets: string[] = [];
  const warnings: string[] = [];
  let detectedYear: number | null = null;

  for (const ws of wb.worksheets) {
    const name = ws.name?.trim() ?? "";
    if (!name || shouldSkipSheetName(name)) {
      skippedSheets.push(name || "(empty)");
      continue;
    }

    const staff = parseStaffSheet(ws, name);
    if (staff && (staff.budget.length > 0 || staff.actuals.length > 0)) {
      staffSheets.push(staff);
      continue;
    }

    const parsed = parsePropertySheet(ws, name);
    if (parsed.budget.revenue.length === 0 && parsed.budget.costs.length === 0) {
      if (!parsed.actuals || (parsed.actuals.revenue.length === 0 && parsed.actuals.costs.length === 0)) {
        skippedSheets.push(name);
        warnings.push(`Sheet "${name}": no recognizable Vuokrat / Operatiiviset kulut blocks (skipped).`);
        continue;
      }
    }

    const propertyId = matchPropertyId(name, parsed.titleRow, tenantPropertyRows);
    const matchedPropertyName = propertyId ? tenantPropertyRows.find((p) => p.id === propertyId)?.name ?? null : null;
    const y = parsed.detectedYear;
    if (y != null) {
      if (detectedYear == null) detectedYear = y;
      else if (detectedYear !== y) warnings.push(`Year mismatch: sheet "${name}" suggests ${y}, earlier sheets ${detectedYear}.`);
    }

    propertySheets.push({
      ...parsed,
      propertyId,
      matchedPropertyName,
      status: propertyId ? "mapped" : "unmapped",
    });
  }

  return {
    fileName,
    detectedYear,
    propertySheets,
    staffSheets,
    skippedSheets,
    warnings,
  };
}
