import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  BUDGET_CAPEX_CATEGORIES,
  BUDGET_CAPEX_STATUS,
  BUDGET_COST_TYPES,
  BUDGET_OCCUPANCY_SPACE_TYPES,
  BUDGET_REVENUE_CATEGORIES,
} from "@/lib/budget/constants";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";
import { syncStaffCostLinesFromHeadcount } from "@/lib/budget/sync-staff-from-headcount";

type Ctx = { params: Promise<{ budgetId: string }> };

const revSet = new Set<string>(BUDGET_REVENUE_CATEGORIES);
const costSet = new Set<string>(BUDGET_COST_TYPES);
const capexCat = new Set<string>(BUDGET_CAPEX_CATEGORIES);
const capexSt = new Set<string>(BUDGET_CAPEX_STATUS);
const occSt = new Set<string>(BUDGET_OCCUPANCY_SPACE_TYPES);

export async function PUT(req: Request, ctx: Ctx) {
  const { budgetId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships } = await getMembershipContext(supabase, user.id);
  const { budget, error } = await loadBudget(supabase, budgetId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, budget.tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: {
    revenueLines?: unknown[];
    costLines?: unknown[];
    headcountLines?: unknown[];
    capexLines?: unknown[];
    occupancyLines?: unknown[];
    syncStaffFromHeadcount?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const year = budget.budget_year;

  async function replaceRevenue(lines: unknown[]) {
    const { error: d } = await supabase.from("budget_revenue_lines").delete().eq("budget_id", budgetId);
    if (d) return d.message;
    const rows = [];
    for (const raw of lines) {
      const o = raw as Record<string, unknown>;
      const cat = String(o.category ?? "");
      if (!revSet.has(cat)) continue;
      const month = Number(o.month);
      const y = Number(o.year);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      if (y !== year) continue;
      rows.push({
        budget_id: budgetId,
        property_id: o.property_id ? String(o.property_id) : null,
        month,
        year: y,
        category: cat,
        budgeted_amount: Number(o.budgeted_amount) || 0,
        notes: o.notes ? String(o.notes) : null,
      });
    }
    if (rows.length === 0) return null;
    const { error: i } = await supabase.from("budget_revenue_lines").insert(rows);
    return i?.message ?? null;
  }

  async function replaceCost(lines: unknown[]) {
    const { error: d } = await supabase
      .from("budget_cost_lines")
      .delete()
      .eq("budget_id", budgetId)
      .neq("cost_type", "staff");
    if (d) return d.message;
    const rows = [];
    for (const raw of lines) {
      const o = raw as Record<string, unknown>;
      const ct = String(o.cost_type ?? "");
      if (ct === "staff") continue;
      if (!costSet.has(ct)) continue;
      const month = Number(o.month);
      const y = Number(o.year);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      if (y !== year) continue;
      rows.push({
        budget_id: budgetId,
        property_id: o.property_id ? String(o.property_id) : null,
        month,
        year: y,
        cost_type: ct,
        budgeted_amount: Number(o.budgeted_amount) || 0,
        notes: o.notes ? String(o.notes) : null,
      });
    }
    if (rows.length === 0) return null;
    const { error: i } = await supabase.from("budget_cost_lines").insert(rows);
    return i?.message ?? null;
  }

  async function replaceHeadcount(lines: unknown[]) {
    const { error: d } = await supabase.from("budget_headcount_lines").delete().eq("budget_id", budgetId);
    if (d) return d.message;
    const rows = [];
    for (const raw of lines) {
      const o = raw as Record<string, unknown>;
      const role_name = String(o.role_name ?? "").trim();
      if (!role_name) continue;
      const month = Number(o.month);
      const y = Number(o.year);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      if (y !== year) continue;
      rows.push({
        budget_id: budgetId,
        property_id: o.property_id ? String(o.property_id) : null,
        month,
        year: y,
        role_name,
        headcount: Math.max(0, Math.floor(Number(o.headcount) || 0)),
        monthly_cost: Math.max(0, Number(o.monthly_cost) || 0),
        notes: o.notes ? String(o.notes) : null,
      });
    }
    if (rows.length === 0) {
      await syncStaffCostLinesFromHeadcount(supabase, budgetId, year, []);
      return null;
    }
    const { error: i } = await supabase.from("budget_headcount_lines").insert(rows);
    if (i) return i.message;
    if (body.syncStaffFromHeadcount !== false) {
      const sync = await syncStaffCostLinesFromHeadcount(
        supabase,
        budgetId,
        year,
        rows as { month: number; year: number; monthly_cost: number | string | null }[],
      );
      if (sync.error) return sync.error;
    }
    return null;
  }

  async function replaceCapex(lines: unknown[]) {
    const { error: d } = await supabase.from("budget_capex_lines").delete().eq("budget_id", budgetId);
    if (d) return d.message;
    const rows = [];
    for (const raw of lines) {
      const o = raw as Record<string, unknown>;
      const cat = String(o.category ?? "");
      const st = String(o.status ?? "planned");
      if (!capexCat.has(cat)) continue;
      if (!capexSt.has(st)) continue;
      rows.push({
        budget_id: budgetId,
        property_id: o.property_id ? String(o.property_id) : null,
        item_name: String(o.item_name ?? "Item").slice(0, 500),
        category: cat,
        planned_date: o.planned_date ? String(o.planned_date).slice(0, 10) : null,
        estimated_cost: Math.max(0, Number(o.estimated_cost) || 0),
        actual_cost: Math.max(0, Number(o.actual_cost) || 0),
        status: st,
        notes: o.notes ? String(o.notes) : null,
      });
    }
    if (rows.length === 0) return null;
    const { error: i } = await supabase.from("budget_capex_lines").insert(rows);
    return i?.message ?? null;
  }

  async function replaceOccupancy(lines: unknown[]) {
    const { error: d } = await supabase.from("budget_occupancy_targets").delete().eq("budget_id", budgetId);
    if (d) return d.message;
    const rows = [];
    for (const raw of lines) {
      const o = raw as Record<string, unknown>;
      const st = String(o.space_type ?? "");
      if (!occSt.has(st)) continue;
      const month = Number(o.month);
      const y = Number(o.year);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;
      if (y !== year) continue;
      rows.push({
        budget_id: budgetId,
        property_id: o.property_id ? String(o.property_id) : null,
        month,
        year: y,
        space_type: st,
        target_occupancy_pct: o.target_occupancy_pct != null ? Number(o.target_occupancy_pct) : null,
        target_units_occupied:
          o.target_units_occupied != null ? Math.max(0, Math.floor(Number(o.target_units_occupied))) : null,
        notes: o.notes ? String(o.notes) : null,
      });
    }
    if (rows.length === 0) return null;
    const { error: i } = await supabase.from("budget_occupancy_targets").insert(rows);
    return i?.message ?? null;
  }

  const errs: string[] = [];
  if (body.revenueLines) {
    const m = await replaceRevenue(body.revenueLines);
    if (m) errs.push(`revenue: ${m}`);
  }
  if (body.costLines) {
    const m = await replaceCost(body.costLines);
    if (m) errs.push(`cost: ${m}`);
  }
  if (body.headcountLines) {
    const m = await replaceHeadcount(body.headcountLines);
    if (m) errs.push(`headcount: ${m}`);
  }
  if (body.capexLines) {
    const m = await replaceCapex(body.capexLines);
    if (m) errs.push(`capex: ${m}`);
  }
  if (body.occupancyLines) {
    const m = await replaceOccupancy(body.occupancyLines);
    if (m) errs.push(`occupancy: ${m}`);
  }

  if (errs.length) return NextResponse.json({ error: errs.join("; ") }, { status: 400 });

  await supabase.from("budgets").update({ updated_at: new Date().toISOString() }).eq("id", budgetId);

  return NextResponse.json({ ok: true });
}
