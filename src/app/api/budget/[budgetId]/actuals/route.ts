import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  aggregateCostByMonth,
  aggregateRevenueByMonth,
  headcountStaffCostByMonth,
  monthIndexToKey,
  totalCostPerMonth,
  totalRevenuePerMonth,
} from "@/lib/budget/aggregates";
import { loadBudgetActuals } from "@/lib/budget/load-actuals";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";
import { normalizeMemberships, resolveAllowedPropertyIds } from "@/lib/reports/report-access";

type Ctx = { params: Promise<{ budgetId: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { budgetId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships, canRunReports } = await getMembershipContext(supabase, user.id);
  if (!canRunReports) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { budget, error } = await loadBudget(supabase, budgetId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, budget.tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const filterPid = (searchParams.get("propertyId") ?? "").trim() || null;

  const { isSuperAdmin, scopedTenantIds } = normalizeMemberships(memberships);
  const { allowedIds, error: pErr } = await resolveAllowedPropertyIds(
    supabase,
    isSuperAdmin,
    scopedTenantIds,
    filterPid ? [filterPid] : null,
  );
  if (pErr || allowedIds.length === 0) {
    return NextResponse.json({ error: pErr ?? "No properties" }, { status: 400 });
  }

  const { data: tenantProps } = await supabase.from("properties").select("id").eq("tenant_id", budget.tenant_id);
  const propIds = (tenantProps ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id) => allowedIds.includes(id));
  if (propIds.length === 0) {
    return NextResponse.json({ error: "No properties for tenant" }, { status: 400 });
  }

  const year = budget.budget_year;
  const { bundle, errors } = await loadBudgetActuals(supabase, propIds, year);

  const revTot = totalRevenuePerMonth(bundle.revenueByCategoryMonth);
  const costTot = totalCostPerMonth(bundle.costByTypeMonth);

  const [{ data: revLines }, { data: costLines }, { data: hcLines }] = await Promise.all([
    supabase.from("budget_revenue_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_cost_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_headcount_lines").select("*").eq("budget_id", budgetId),
  ]);

  const staff = headcountStaffCostByMonth(
    (hcLines ?? []) as Parameters<typeof headcountStaffCostByMonth>[0],
    year,
    filterPid,
  );
  const budRevByCat = aggregateRevenueByMonth(
    (revLines ?? []) as Parameters<typeof aggregateRevenueByMonth>[0],
    year,
    filterPid,
  );
  const budCostByCat = aggregateCostByMonth(
    (costLines ?? []) as Parameters<typeof aggregateCostByMonth>[0],
    year,
    filterPid,
    staff,
  );
  const budgetRevTot = totalRevenuePerMonth(budRevByCat);
  const budgetCostTot = totalCostPerMonth(budCostByCat);

  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mk = monthIndexToKey(m);
    months.push({
      month: m,
      actualRevenue: revTot[mk] ?? 0,
      actualCosts: costTot[mk] ?? 0,
      leaseInvoices: bundle.leaseInvoiceTotalByMonth[mk] ?? 0,
      bookings: bundle.bookingRevenueByMonth[mk] ?? 0,
      budgetRevenue: budgetRevTot[mk] ?? 0,
      budgetCost: budgetCostTot[mk] ?? 0,
    });
  }

  return NextResponse.json({
    year,
    propertyIds: propIds,
    actuals: bundle,
    supplementalNote:
      "Lease invoice and booking totals are raw cash components for drill-down; primary comparison uses historical_* tables when imported.",
    loadErrors: errors,
    months,
  });
}
