import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { BUDGET_REVENUE_CATEGORIES } from "@/lib/budget/constants";
import { loadBudgetActuals } from "@/lib/budget/load-actuals";
import { getMembershipContext, loadBudget, userCanViewBudget } from "@/lib/budget/server-access";
import { normalizeMemberships, resolveAllowedPropertyIds } from "@/lib/reports/report-access";

type Ctx = { params: Promise<{ budgetId: string }> };

function extractJsonObject(raw: string): string | null {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  return raw.slice(first, last + 1);
}

export async function POST(_req: Request, ctx: Ctx) {
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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 501 });
  }

  const { isSuperAdmin, scopedTenantIds } = normalizeMemberships(memberships);
  const { allowedIds } = await resolveAllowedPropertyIds(supabase, isSuperAdmin, scopedTenantIds, null);
  const { data: tenantProps } = await supabase.from("properties").select("id").eq("tenant_id", budget.tenant_id);
  const propIds = (tenantProps ?? [])
    .map((r: { id: string }) => r.id)
    .filter((id) => allowedIds.includes(id));

  const y1 = budget.budget_year - 1;
  const y2 = budget.budget_year - 2;
  const bundles: string[] = [];
  for (const y of [y2, y1]) {
    if (y < 2000) continue;
    const { bundle } = await loadBudgetActuals(supabase, propIds, y);
    bundles.push(
      `Year ${y}: ` +
        BUDGET_REVENUE_CATEGORIES.map((c) => {
          const s = bundle.revenueByCategoryMonth[c];
          const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => s[`m${m}` as keyof typeof s] ?? 0);
          return `${c}=[${arr.join(",")}]`;
        }).join("; "),
    );
  }

  let pipeline = "n/a";
  const { data: leads } = await supabase
    .from("customer_companies")
    .select("id, stage")
    .eq("tenant_id", budget.tenant_id)
    .eq("archived", false)
    .limit(500);
  if (leads?.length) {
    const by = new Map<string, number>();
    for (const l of leads as { stage: string | null }[]) {
      const s = (l.stage ?? "unknown").toLowerCase();
      by.set(s, (by.get(s) ?? 0) + 1);
    }
    pipeline = [...by.entries()].map(([k, v]) => `${k}:${v}`).join(", ");
  }

  const targetYear = budget.budget_year;
  const system = [
    "You are a financial planning assistant for a flexible workspace / property operator.",
    `Propose a monthly revenue budget for calendar year ${targetYear} in EUR.`,
    "Use the historical monthly series (12 values per category, Jan-Dec) and pipeline hint.",
    "Output a single JSON object only, no markdown.",
    `Schema: { "explanation": string (2-4 sentences), "byCategory": { ${BUDGET_REVENUE_CATEGORIES.map((c) => `"${c}": number[12]`).join(", ")} } }`,
    "Each array must have exactly 12 non-negative numbers.",
  ].join("\n");

  const userMsg = [`Historical actuals (EUR, Jan-Dec per line):`, ...bundles, `CRM pipeline counts by stage: ${pipeline}`].join(
    "\n",
  );

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-latest",
      max_tokens: 4096,
      temperature: 0.3,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    return NextResponse.json({ error: `Claude error: ${t.slice(0, 400)}` }, { status: 502 });
  }

  const data = (await resp.json()) as { content?: Array<{ type?: string; text?: string }> };
  const rawText =
    data.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim() ?? "";
  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    return NextResponse.json({ error: "Model did not return JSON", raw: rawText.slice(0, 500) }, { status: 422 });
  }

  let parsed: { explanation?: string; byCategory?: Record<string, number[]> };
  try {
    parsed = JSON.parse(jsonText) as typeof parsed;
  } catch {
    return NextResponse.json({ error: "Invalid JSON from model" }, { status: 422 });
  }

  const byCategory: Record<string, number[]> = {};
  for (const c of BUDGET_REVENUE_CATEGORIES) {
    const arr = parsed.byCategory?.[c];
    const safe = Array.isArray(arr)
      ? arr.slice(0, 12).map((n) => (Number.isFinite(Number(n)) ? Math.max(0, Number(n)) : 0))
      : Array(12).fill(0);
    while (safe.length < 12) safe.push(0);
    byCategory[c] = safe;
  }

  return NextResponse.json({
    explanation: String(parsed.explanation ?? "").slice(0, 4000),
    byCategory,
    targetYear,
  });
}
