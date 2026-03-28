import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipContext, userCanViewBudget } from "@/lib/budget/server-access";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships, canManageAny } = await getMembershipContext(supabase, user.id);
  if (!canManageAny) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row, error: fErr } = await supabase.from("budget_combinations").select("tenant_id").eq("id", id).maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, (row as { tenant_id: string }).tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("budget_combinations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships, canManageAny } = await getMembershipContext(supabase, user.id);
  if (!canManageAny) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: row, error: fErr } = await supabase.from("budget_combinations").select("tenant_id").eq("id", id).maybeSingle();
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tid = (row as { tenant_id: string }).tenant_id;
  if (!userCanViewBudget(memberships, tid)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { name?: string; property_ids?: string[]; include_admin?: boolean; is_default?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.is_default) {
    await supabase.from("budget_combinations").update({ is_default: false }).eq("tenant_id", tid);
  }

  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.include_admin !== undefined) patch.include_admin = body.include_admin;
  if (body.is_default !== undefined) patch.is_default = body.is_default;
  if (body.property_ids) {
    const { data: props } = await supabase.from("properties").select("id").eq("tenant_id", tid);
    const allowed = new Set((props ?? []).map((p: { id: string }) => p.id));
    patch.property_ids = body.property_ids.filter((x) => allowed.has(x));
  }

  const { data, error } = await supabase.from("budget_combinations").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ combination: data });
}
