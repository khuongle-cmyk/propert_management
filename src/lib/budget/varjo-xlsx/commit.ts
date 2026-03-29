import type { SupabaseClient } from "@supabase/supabase-js";
import { syncStaffCostLinesFromHeadcount } from "@/lib/budget/sync-staff-from-headcount";
import type { VarjoImportMode } from "./merge-sections";
import { mergePropertySections } from "./merge-sections";
import type { ParsedStaffSheet } from "./parse";
import type { VarjoPropertySheetResult, VarjoWorkbookParse } from "./parse-workbook";

export type VarjoCommitSummary = {
  propertiesImported: number;
  administrationBudgetId: string | null;
  revenueLineCount: number;
  costLineCount: number;
  headcountLineCount: number;
  errors: string[];
};

async function findOrCreatePropertyBudget(
  supabase: SupabaseClient,
  tenantId: string,
  propertyId: string,
  year: number,
  budgetType: "annual" | "reforecast",
  userId: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("budget_year", year)
    .eq("budget_type", budgetType)
    .eq("budget_scope", "property")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (existing) return existing as { id: string };

  const { data: prop } = await supabase.from("properties").select("name").eq("id", propertyId).maybeSingle();
  const pname = (prop as { name: string } | null)?.name ?? "Property";
  const { data: created, error } = await supabase
    .from("budgets")
    .insert({
      tenant_id: tenantId,
      property_id: propertyId,
      budget_scope: "property",
      name: `${pname} — Varjo ${year}`,
      budget_year: year,
      budget_type: budgetType,
      status: "draft",
      created_by: userId,
      opening_cash_balance: 0,
    })
    .select("id")
    .single();
  if (error) return null;
  return created as { id: string };
}

async function findOrCreateAdministrationBudget(
  supabase: SupabaseClient,
  tenantId: string,
  year: number,
  budgetType: "annual" | "reforecast",
  userId: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await supabase
    .from("budgets")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("budget_year", year)
    .eq("budget_type", budgetType)
    .eq("budget_scope", "administration")
    .is("property_id", null)
    .maybeSingle();

  if (existing) return existing as { id: string };

  const { data: created, error } = await supabase
    .from("budgets")
    .insert({
      tenant_id: tenantId,
      property_id: null,
      budget_scope: "administration",
      name: `Administration — Varjo ${year}`,
      budget_year: year,
      budget_type: budgetType,
      status: "draft",
      created_by: userId,
      opening_cash_balance: 0,
    })
    .select("id")
    .single();
  if (error) return null;
  return created as { id: string };
}

function revKey(propertyId: string | null, category: string, month: number) {
  return `${propertyId ?? ""}|${category}|${month}`;
}

function costKey(propertyId: string | null, costType: string, month: number) {
  return `${propertyId ?? ""}|${costType}|${month}`;
}

async function insertRevenueLines(
  supabase: SupabaseClient,
  budgetId: string,
  propertyId: string | null,
  year: number,
  rows: Array<{ category: string; month: number; budgeted_amount: number; actual_amount: number }>,
  overwrite: boolean,
): Promise<number> {
  let toWrite = rows;
  if (!overwrite) {
    const { data: exist } = await supabase.from("budget_revenue_lines").select("category,month,property_id").eq("budget_id", budgetId).eq("year", year);
    const keys = new Set((exist ?? []).map((r: { category: string; month: number; property_id: string | null }) => revKey(r.property_id, r.category, r.month)));
    toWrite = rows.filter((r) => !keys.has(revKey(propertyId, r.category, r.month)));
  } else {
    const categories = [...new Set(rows.map((r) => r.category))];
    if (categories.length) {
      let dq = supabase.from("budget_revenue_lines").delete().eq("budget_id", budgetId).eq("year", year).in("category", categories);
      if (propertyId) dq = dq.eq("property_id", propertyId);
      else dq = dq.is("property_id", null);
      await dq;
    }
  }

  if (!toWrite.length) return 0;

  const payload = toWrite.map((r) => ({
    budget_id: budgetId,
    property_id: propertyId,
    month: r.month,
    year,
    category: r.category,
    budgeted_amount: r.budgeted_amount,
    actual_amount: r.actual_amount,
  }));

  let { error } = await supabase.from("budget_revenue_lines").insert(payload);
  if (error?.message?.includes("actual_amount")) {
    const stripped = payload.map(({ actual_amount: _a, ...rest }) => rest);
    const r2 = await supabase.from("budget_revenue_lines").insert(stripped);
    error = r2.error;
  }
  if (error) throw new Error(error.message);
  return payload.length;
}

async function insertCostLines(
  supabase: SupabaseClient,
  budgetId: string,
  propertyId: string | null,
  year: number,
  rows: Array<{ cost_type: string; month: number; budgeted_amount: number; actual_amount: number }>,
  overwrite: boolean,
): Promise<number> {
  let toWrite = rows;
  if (!overwrite) {
    const { data: exist } = await supabase.from("budget_cost_lines").select("cost_type,month,property_id").eq("budget_id", budgetId).eq("year", year);
    const keys = new Set(
      (exist ?? []).map((r: { cost_type: string; month: number; property_id: string | null }) => costKey(r.property_id, r.cost_type, r.month)),
    );
    toWrite = rows.filter((r) => !keys.has(costKey(propertyId, r.cost_type, r.month)));
  } else {
    const types = [...new Set(rows.map((r) => r.cost_type))];
    if (types.length) {
      let dq = supabase.from("budget_cost_lines").delete().eq("budget_id", budgetId).eq("year", year).in("cost_type", types);
      if (propertyId) dq = dq.eq("property_id", propertyId);
      else dq = dq.is("property_id", null);
      await dq;
    }
  }

  if (!toWrite.length) return 0;

  const payload = toWrite.map((r) => ({
    budget_id: budgetId,
    property_id: propertyId,
    month: r.month,
    year,
    cost_type: r.cost_type,
    budgeted_amount: r.budgeted_amount,
    actual_amount: r.actual_amount,
  }));

  let { error } = await supabase.from("budget_cost_lines").insert(payload);
  if (error?.message?.includes("actual_amount")) {
    const stripped = payload.map(({ actual_amount: _a, ...rest }) => rest);
    const r2 = await supabase.from("budget_cost_lines").insert(stripped);
    error = r2.error;
  }
  if (error) throw new Error(error.message);
  return payload.length;
}

function accumulateStaffByName(sheets: ParsedStaffSheet[]): Map<string, Map<number, { bud: number; act: number }>> {
  const byName = new Map<string, Map<number, { bud: number; act: number }>>();
  function bump(list: { name: string; months: { month: number; amount: number }[] }[], field: "bud" | "act") {
    for (const p of list) {
      const key = p.name.trim().toLowerCase();
      if (!byName.has(key)) byName.set(key, new Map());
      const m = byName.get(key)!;
      for (const { month, amount } of p.months) {
        const cur = m.get(month) ?? { bud: 0, act: 0 };
        if (field === "bud") cur.bud += amount;
        else cur.act += amount;
        m.set(month, cur);
      }
    }
  }
  for (const sh of sheets) {
    bump(sh.budget, "bud");
    bump(sh.actuals, "act");
  }
  return byName;
}

function staffDisplayNames(sheets: ParsedStaffSheet[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const sh of sheets) {
    for (const p of [...sh.budget, ...sh.actuals]) {
      const k = p.name.trim().toLowerCase();
      if (!m.has(k)) m.set(k, p.name.trim());
    }
  }
  return m;
}

export async function executeVarjoBudgetImport(
  supabase: SupabaseClient,
  parsed: VarjoWorkbookParse,
  opts: {
    tenantId: string;
    year: number;
    budgetType: "annual" | "reforecast";
    mode: VarjoImportMode;
    overwrite: boolean;
    userId: string;
  },
): Promise<VarjoCommitSummary> {
  const errors: string[] = [];
  let revenueLineCount = 0;
  let costLineCount = 0;
  let headcountLineCount = 0;
  let propertiesImported = 0;
  let administrationBudgetId: string | null = null;

  const year = opts.year;

  try {
    for (const sheet of parsed.propertySheets) {
      if (sheet.status !== "mapped" || !sheet.propertyId) continue;
      const budgetRow = await findOrCreatePropertyBudget(
        supabase,
        opts.tenantId,
        sheet.propertyId,
        year,
        opts.budgetType,
        opts.userId,
      );
      if (!budgetRow) {
        errors.push(`Could not create/find budget for sheet ${sheet.sheetName}`);
        continue;
      }
      propertiesImported += 1;

      const { revenue, costs } = mergePropertySections(sheet.budget, sheet.actuals, opts.mode);

      const revRows = revenue.map((r) => ({
        category: r.category,
        month: r.month,
        budgeted_amount: r.budgeted_amount,
        actual_amount: r.actual_amount,
      }));

      const costRows = costs.map((r) => ({
        cost_type: r.costType,
        month: r.month,
        budgeted_amount: r.budgeted_amount,
        actual_amount: r.actual_amount,
      }));

      if (revRows.length) {
        revenueLineCount += await insertRevenueLines(supabase, budgetRow.id, sheet.propertyId, year, revRows, opts.overwrite);
      }
      if (costRows.length) {
        costLineCount += await insertCostLines(supabase, budgetRow.id, sheet.propertyId, year, costRows, opts.overwrite);
      }

      await supabase.from("budgets").update({ updated_at: new Date().toISOString() }).eq("id", budgetRow.id);
    }

    if (parsed.staffSheets.length) {
      const admin = await findOrCreateAdministrationBudget(supabase, opts.tenantId, year, opts.budgetType, opts.userId);
      if (!admin) {
        errors.push("Could not create administration budget for payroll sheets.");
      } else {
        administrationBudgetId = admin.id;
        if (opts.overwrite) {
          await supabase.from("budget_headcount_lines").delete().eq("budget_id", admin.id).eq("year", year);
        }

        const merged = accumulateStaffByName(parsed.staffSheets);
        const names = staffDisplayNames(parsed.staffSheets);
        let hcPayload: Record<string, unknown>[] = [];

        for (const [nameKey, monthMap] of merged) {
          const displayName = names.get(nameKey) ?? nameKey;
          for (const [month, amt] of monthMap) {
            let monthly_cost = 0;
            let actual_monthly_cost = 0;
            if (opts.mode === "budget") {
              monthly_cost = amt.bud;
            } else if (opts.mode === "actuals") {
              actual_monthly_cost = amt.act > 0 ? amt.act : amt.bud;
            } else {
              monthly_cost = amt.bud;
              actual_monthly_cost = amt.act;
            }
            if (monthly_cost === 0 && actual_monthly_cost === 0) continue;
            hcPayload.push({
              budget_id: admin.id,
              property_id: null,
              month,
              year,
              role_name: displayName,
              headcount: 1,
              monthly_cost,
              actual_monthly_cost,
            });
          }
        }

        if (!opts.overwrite && hcPayload.length) {
          const { data: exHc } = await supabase.from("budget_headcount_lines").select("role_name, month").eq("budget_id", admin.id).eq("year", year);
          const existKeys = new Set(
            (exHc ?? []).map((r: { role_name: string; month: number }) => `${String(r.role_name).toLowerCase().trim()}|${r.month}`),
          );
          hcPayload = hcPayload.filter((h) => !existKeys.has(`${String(h.role_name).toLowerCase().trim()}|${h.month}`));
        }

        if (hcPayload.length) {
          let insErr = (await supabase.from("budget_headcount_lines").insert(hcPayload)).error;
          if (insErr?.message?.includes("actual_monthly_cost")) {
            const stripped = hcPayload.map(({ actual_monthly_cost: _a, ...rest }) => rest);
            const r2 = await supabase.from("budget_headcount_lines").insert(stripped);
            insErr = r2.error;
            if (!insErr) {
              errors.push(
                "Imported headcount without actual_monthly_cost (run sql/budget_line_actual_amounts.sql for full budget vs actuals support).",
              );
            }
          }
          if (insErr) errors.push(`Headcount insert: ${insErr.message}`);
          else {
            headcountLineCount = hcPayload.length;
            const sync = await syncStaffCostLinesFromHeadcount(
              supabase,
              admin.id,
              year,
              hcPayload as { month: number; year: number; monthly_cost: number }[],
            );
            if (sync.error) errors.push(`Staff sync: ${sync.error}`);
          }
        }
        await supabase.from("budgets").update({ updated_at: new Date().toISOString() }).eq("id", admin.id);
      }
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    propertiesImported,
    administrationBudgetId,
    revenueLineCount,
    costLineCount,
    headcountLineCount,
    errors,
  };
}
