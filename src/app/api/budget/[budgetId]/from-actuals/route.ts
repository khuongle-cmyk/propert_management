import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BudgetRevenueCategory } from "@/lib/budget/constants";
import { BUDGET_REVENUE_CATEGORIES } from "@/lib/budget/constants";
import { monthIndexToKey } from "@/lib/budget/aggregates";
import { loadBudgetActuals } from "@/lib/budget/load-actuals";
import { mapHistoricalCostTypeToBudget } from "@/lib/budget/map-historical-cost";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";
import { normalizeMemberships, resolveAllowedPropertyIds } from "@/lib/reports/report-access";

type Ctx = { params: Promise<{ budgetId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { budgetId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships, canManageAny } = await getMembershipContext(supabase, user.id);
  if (!canManageAny) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { budget, error } = await loadBudget(supabase, budgetId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, budget.tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { source_year?: number; include_costs?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const source_year = Number(body.source_year);
  if (!Number.isFinite(source_year)) {
    return NextResponse.json({ error: "source_year required" }, { status: 400 });
  }

  const { isSuperAdmin, scopedTenantIds } = normalizeMemberships(memberships);
  const { allowedIds } = await resolveAllowedPropertyIds(supabase, isSuperAdmin, scopedTenantIds, null);
  const { data: tenantProps } = await supabase.from("properties").select("id").eq("tenant_id", budget.tenant_id);
  const propIds = (tenantProps ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id) => allowedIds.includes(id));
  if (propIds.length === 0) return NextResponse.json({ error: "No properties" }, { status: 400 });

  const { bundle } = await loadBudgetActuals(supabase, propIds, source_year);
  const targetYear = budget.budget_year;

  const revenueLines: Record<string, unknown>[] = [];
  for (const cat of BUDGET_REVENUE_CATEGORIES) {
    const series = bundle.revenueByCategoryMonth[cat as BudgetRevenueCategory];
    for (let m = 1; m <= 12; m++) {
      const mk = monthIndexToKey(m);
      revenueLines.push({
        budget_id: budgetId,
        property_id: null,
        month: m,
        year: targetYear,
        category: cat,
        budgeted_amount: series[mk] ?? 0,
      });
    }
  }

  const { error: d1 } = await supabase.from("budget_revenue_lines").delete().eq("budget_id", budgetId);
  if (d1) return NextResponse.json({ error: d1.message }, { status: 500 });
  const { error: i1 } = await supabase.from("budget_revenue_lines").insert(revenueLines);
  if (i1) return NextResponse.json({ error: i1.message }, { status: 500 });

  if (body.include_costs) {
    const costLines: Record<string, unknown>[] = [];
    const { data: rawCosts } = await supabase
      .from("historical_costs")
      .select("month, year, amount_ex_vat, cost_type")
      .in("property_id", propIds)
      .eq("year", source_year);

    const byTypeMonth: Record<string, number[]> = {};
    for (const ct of [
      "cleaning",
      "utilities",
      "property_management",
      "insurance",
      "security",
      "it_infrastructure",
      "marketing",
      "staff",
      "capex",
      "other",
    ] as const) {
      byTypeMonth[ct] = Array(12).fill(0);
    }
    for (const row of rawCosts ?? []) {
      const o = row as { month: number; amount_ex_vat: unknown; cost_type: string | null };
      const m = o.month;
      if (m < 1 || m > 12) continue;
      const t = mapHistoricalCostTypeToBudget(o.cost_type);
      byTypeMonth[t][m - 1] += Number(o.amount_ex_vat) || 0;
    }
    for (const ct of Object.keys(byTypeMonth)) {
      for (let m = 1; m <= 12; m++) {
        costLines.push({
          budget_id: budgetId,
          property_id: null,
          month: m,
          year: targetYear,
          cost_type: ct,
          budgeted_amount: byTypeMonth[ct][m - 1] ?? 0,
        });
      }
    }
    const { error: d2 } = await supabase.from("budget_cost_lines").delete().eq("budget_id", budgetId).neq("cost_type", "staff");
    if (d2) return NextResponse.json({ error: d2.message }, { status: 500 });
    const { error: i2 } = await supabase.from("budget_cost_lines").insert(costLines);
    if (i2) return NextResponse.json({ error: i2.message }, { status: 500 });
  }

  await supabase.from("budgets").update({ updated_at: new Date().toISOString() }).eq("id", budgetId);

  return NextResponse.json({ ok: true, revenueRows: revenueLines.length });
}
