import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";

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

  const parts = [rev, cost, hc, cx, occ].map((x) => x.error?.message).filter(Boolean);
  if (parts.length) return NextResponse.json({ error: parts.join("; ") }, { status: 500 });

  return NextResponse.json({
    budget,
    revenueLines: rev.data ?? [],
    costLines: cost.data ?? [],
    headcountLines: hc.data ?? [],
    capexLines: cx.data ?? [],
    occupancyLines: occ.data ?? [],
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
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

  let body: Partial<{
    name: string;
    status: string;
    notes: string | null;
    opening_cash_balance: number;
    budget_type: string;
    version_label: string | null;
    approved_at: string | null;
    approved_by: string | null;
  }>;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.opening_cash_balance != null) patch.opening_cash_balance = Number(body.opening_cash_balance) || 0;
  if (body.budget_type != null) patch.budget_type = body.budget_type;
  if (body.version_label !== undefined) patch.version_label = body.version_label;
  if (body.status != null) {
    patch.status = body.status;
    if (body.status === "approved" || body.status === "active") {
      patch.approved_by = user.id;
      patch.approved_at = new Date().toISOString();
    }
  }

  const { data, error: uErr } = await supabase.from("budgets").update(patch).eq("id", budgetId).select("*").single();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  return NextResponse.json({ budget: data });
}
