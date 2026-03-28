import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BUDGET_COST_TYPES, BUDGET_REVENUE_CATEGORIES } from "@/lib/budget/constants";
import { getMembershipContext, userCanViewBudget } from "@/lib/budget/server-access";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { memberships, canManageAny } = await getMembershipContext(supabase, user.id);
  if (!canManageAny) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const budgetId = String(form.get("budgetId") ?? "").trim();
  const file = form.get("file");
  if (!budgetId || !(file instanceof Blob)) {
    return NextResponse.json({ error: "budgetId and file required" }, { status: 400 });
  }

  const { data: budget, error: bErr } = await supabase.from("budgets").select("id, tenant_id, budget_year").eq("id", budgetId).single();
  if (bErr || !budget) return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, (budget as { tenant_id: string }).tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const year = Number((budget as { budget_year: number }).budget_year);
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return NextResponse.json({ error: "Empty workbook" }, { status: 400 });

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  }) as (string | number | null)[][];

  if (rows.length < 2) return NextResponse.json({ error: "No data rows" }, { status: 400 });

  const header = (rows[0] ?? []).map((c) => String(c ?? "").toLowerCase().trim());
  const monthCols: { idx: number; month: number }[] = [];
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  for (let i = 1; i < header.length; i++) {
    const h = header[i];
    const mi = monthNames.findIndex((m) => h.startsWith(m) || h === m);
    if (mi >= 0) monthCols.push({ idx: i, month: mi + 1 });
  }
  if (monthCols.length === 0) {
    return NextResponse.json(
      { error: "Could not detect Jan-Dec columns (name first column with month headers)." },
      { status: 400 },
    );
  }

  const labelToRev = new Map<string, string>();
  for (const c of BUDGET_REVENUE_CATEGORIES) {
    labelToRev.set(c.replace(/_/g, " "), c);
    labelToRev.set(c.replace(/_/g, ""), c);
  }
  const labelToCost = new Map<string, string>();
  for (const c of BUDGET_COST_TYPES) {
    labelToCost.set(c.replace(/_/g, " "), c);
    labelToCost.set(c.replace(/_/g, ""), c);
  }

  const revenueLines: Record<string, unknown>[] = [];
  const costLines: Record<string, unknown>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row?.length) continue;
    const label = String(row[0] ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    if (!label || label === "total") continue;

    let cat: string | undefined;
    if (labelToRev.has(label)) cat = labelToRev.get(label);
    else {
      for (const [k, v] of labelToRev) {
        if (label.includes(k) || k.includes(label)) {
          cat = v;
          break;
        }
      }
    }
    const isRev = !!cat;
    let costCat: string | undefined;
    if (!isRev) {
      if (labelToCost.has(label)) costCat = labelToCost.get(label);
      else {
        for (const [k, v] of labelToCost) {
          if (label.includes(k) || k.includes(label)) {
            costCat = v;
            break;
          }
        }
      }
    }
    if (!isRev && !costCat) continue;
    if (costCat === "staff") continue;

    for (const { idx, month } of monthCols) {
      const raw = row[idx];
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", "."));
      const amount = Number.isFinite(n) ? n : 0;
      if (isRev && cat) {
        revenueLines.push({
          budget_id: budgetId,
          property_id: null,
          month,
          year,
          category: cat,
          budgeted_amount: amount,
        });
      } else if (costCat) {
        costLines.push({
          budget_id: budgetId,
          property_id: null,
          month,
          year,
          cost_type: costCat,
          budgeted_amount: amount,
        });
      }
    }
  }

  if (revenueLines.length) {
    await supabase.from("budget_revenue_lines").delete().eq("budget_id", budgetId);
    const { error } = await supabase.from("budget_revenue_lines").insert(revenueLines);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (costLines.length) {
    await supabase.from("budget_cost_lines").delete().eq("budget_id", budgetId).neq("cost_type", "staff");
    const { error } = await supabase.from("budget_cost_lines").insert(costLines);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("budgets").update({ updated_at: new Date().toISOString() }).eq("id", budgetId);

  return NextResponse.json({ ok: true, revenueRows: revenueLines.length, costRows: costLines.length });
}
