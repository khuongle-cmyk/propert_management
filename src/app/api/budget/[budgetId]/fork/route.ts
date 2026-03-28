import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";

type Ctx = { params: Promise<{ budgetId: string }> };

function scale(v: number, pct: number) {
  return Math.round(v * (1 + pct / 100) * 100) / 100;
}

export async function POST(req: Request, ctx: Ctx) {
  const { budgetId } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships, canManageAny } = await getMembershipContext(supabase, user.id);
  if (!canManageAny) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { budget: src, error } = await loadBudget(supabase, budgetId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, src.tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { target_year?: number; name?: string; apply_pct?: number; budget_type?: string; version_label?: string | null };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const target_year = Number(body.target_year);
  if (!Number.isFinite(target_year) || target_year < 2000 || target_year > 2100) {
    return NextResponse.json({ error: "target_year required" }, { status: 400 });
  }
  const pct = Number(body.apply_pct) || 0;
  const name = String(body.name ?? "").trim() || `${src.name} (${target_year})`;

  const scope =
    (src as { budget_scope?: string }).budget_scope ??
    (src.property_id ? "property" : "administration");

  const { data: created, error: cErr } = await supabase
    .from("budgets")
    .insert({
      tenant_id: src.tenant_id,
      property_id: src.property_id,
      budget_scope: scope,
      name,
      budget_year: target_year,
      budget_type: body.budget_type === "reforecast" ? "reforecast" : "annual",
      status: "draft",
      notes: src.notes,
      created_by: user.id,
      opening_cash_balance: scale(Number(src.opening_cash_balance) || 0, pct),
      parent_budget_id: budgetId,
      version_label: body.version_label ?? "Fork",
    })
    .select("*")
    .single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const newId = created.id as string;

  const [rev, cost, hc, cx, occ] = await Promise.all([
    supabase.from("budget_revenue_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_cost_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_headcount_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_capex_lines").select("*").eq("budget_id", budgetId),
    supabase.from("budget_occupancy_targets").select("*").eq("budget_id", budgetId),
  ]);

  const remap = (rows: Record<string, unknown>[], map: (r: Record<string, unknown>) => Record<string, unknown>) =>
    rows.map((r) => map({ ...r }));

  if (rev.data?.length) {
    const ins = remap(rev.data as Record<string, unknown>[], (r) => {
      delete r.id;
      delete r.created_at;
      delete r.updated_at;
      r.budget_id = newId;
      r.year = target_year;
      r.budgeted_amount = scale(Number(r.budgeted_amount) || 0, pct);
      return r;
    });
    await supabase.from("budget_revenue_lines").insert(ins);
  }
  if (cost.data?.length) {
    const ins = remap(cost.data as Record<string, unknown>[], (r) => {
      delete r.id;
      delete r.created_at;
      delete r.updated_at;
      r.budget_id = newId;
      r.year = target_year;
      r.budgeted_amount = scale(Number(r.budgeted_amount) || 0, pct);
      return r;
    });
    await supabase.from("budget_cost_lines").insert(ins);
  }
  if (hc.data?.length) {
    const ins = remap(hc.data as Record<string, unknown>[], (r) => {
      delete r.id;
      delete r.created_at;
      delete r.updated_at;
      r.budget_id = newId;
      r.year = target_year;
      r.monthly_cost = scale(Number(r.monthly_cost) || 0, pct);
      return r;
    });
    await supabase.from("budget_headcount_lines").insert(ins);
  }
  if (cx.data?.length) {
    const ins = remap(cx.data as Record<string, unknown>[], (r) => {
      delete r.id;
      delete r.created_at;
      delete r.updated_at;
      r.budget_id = newId;
      r.estimated_cost = scale(Number(r.estimated_cost) || 0, pct);
      r.actual_cost = 0;
      return r;
    });
    await supabase.from("budget_capex_lines").insert(ins);
  }
  if (occ.data?.length) {
    const ins = remap(occ.data as Record<string, unknown>[], (r) => {
      delete r.id;
      delete r.created_at;
      delete r.updated_at;
      r.budget_id = newId;
      r.year = target_year;
      return r;
    });
    await supabase.from("budget_occupancy_targets").insert(ins);
  }

  return NextResponse.json({ budget: created });
}
