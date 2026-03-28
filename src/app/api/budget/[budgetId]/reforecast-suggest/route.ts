import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";

type Ctx = { params: Promise<{ budgetId: string }> };

function extractJsonObject(raw: string): string | null {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  return raw.slice(first, last + 1);
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

  const { budget, error } = await loadBudget(supabase, budgetId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  if (!budget) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!userCanViewBudget(memberships, budget.tenant_id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { months_payload?: { month: number; budget_rev: number; actual_rev: number; budget_cost: number; actual_cost: number }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 501 });

  const months = body.months_payload ?? [];
  const summary = months
    .map(
      (m) =>
        `M${m.month}: rev budget=${m.budget_rev.toFixed(0)} actual=${m.actual_rev.toFixed(0)}; cost budget=${m.budget_cost.toFixed(0)} actual=${m.actual_cost.toFixed(0)}`,
    )
    .join("\n");

  const system = [
    "You help operators reforecast the remainder of the year.",
    "Given month-by-month budget vs actuals so far, output JSON only:",
    '{ "analysis": string, "suggested_revenue_adjustment_pct": number, "suggested_cost_adjustment_pct": number, "commentary_on_remaining_quarters": string }',
    "Percent adjustments are for forward months (rough heuristic), can be negative.",
  ].join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 1200,
      temperature: 0.2,
      system,
      messages: [{ role: "user", content: `Budget year ${budget.budget_year}:\n${summary}` }],
    }),
  });

  if (!resp.ok) {
    return NextResponse.json({ error: await resp.text() }, { status: 502 });
  }

  const data = (await resp.json()) as { content?: Array<{ type?: string; text?: string }> };
  const rawText =
    data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim() ?? "";
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) return NextResponse.json({ error: "No JSON from model", raw: rawText.slice(0, 400) }, { status: 422 });

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    return NextResponse.json({ suggestion: parsed });
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 422 });
  }
}
