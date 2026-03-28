import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildBudgetExcelWorkbook } from "@/lib/budget/excel-export";
import { getMembershipContext, loadBudget, userCanViewBudget, type BudgetRow } from "@/lib/budget/server-access";

type Ctx = { params: Promise<{ budgetId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
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

  const [rev, cost, hc, cx, occ] = await Promise.all([
    supabase.from("budget_revenue_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_cost_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_headcount_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_capex_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_occupancy_targets").select("*").eq("budget_id", budgetId),
  ]);

  let propertyName: string | null = null;
  if (budget.property_id) {
    const { data: p } = await supabase.from("properties").select("name").eq("id", budget.property_id).maybeSingle();
    propertyName = (p as { name: string } | null)?.name ?? null;
  }

  const buf = await buildBudgetExcelWorkbook({
    budget: budget as BudgetRow,
    propertyName,
    revenueLines: (rev.data ?? []) as Record<string, unknown>[],
    costLines: (cost.data ?? []) as Record<string, unknown>[],
    headcountLines: (hc.data ?? []) as Record<string, unknown>[],
    capexLines: (cx.data ?? []) as Record<string, unknown>[],
    occupancyLines: (occ.data ?? []) as Record<string, unknown>[],
  });

  const filename = `budget-${budget.budget_year}-${String(budget.name).replace(/[^\w.-]+/g, "_").slice(0, 60)}.xlsx`;
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
