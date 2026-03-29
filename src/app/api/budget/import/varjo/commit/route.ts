import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipContext, userCanViewBudget } from "@/lib/budget/server-access";
import { executeVarjoBudgetImport } from "@/lib/budget/varjo-xlsx/commit";
import type { VarjoImportMode } from "@/lib/budget/varjo-xlsx/merge-sections";
import { parseVarjoWorkbookBuffer } from "@/lib/budget/varjo-xlsx/parse-workbook";

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { canManageAny, memberships } = await getMembershipContext(supabase, user.id);
  if (!canManageAny) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData();
  const tenantId = String(form.get("tenantId") ?? "").trim();
  const file = form.get("file");
  const yearRaw = String(form.get("year") ?? "").trim();
  const budgetType = String(form.get("budgetType") ?? "annual").trim() === "reforecast" ? "reforecast" : "annual";
  const mode = (String(form.get("mode") ?? "both").trim() as VarjoImportMode) || "both";
  const overwrite = String(form.get("overwrite") ?? "true").trim() === "true";

  if (!tenantId || !(file instanceof Blob)) {
    return NextResponse.json({ error: "tenantId and file required" }, { status: 400 });
  }
  if (!userCanViewBudget(memberships, tenantId)) {
    return NextResponse.json({ error: "Forbidden for tenant" }, { status: 403 });
  }

  const { data: props, error: pErr } = await supabase.from("properties").select("id,name").eq("tenant_id", tenantId).order("name", { ascending: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const ab = await file.arrayBuffer();
  const fileName = (file as File).name || "budget.xlsx";
  const parsed = await parseVarjoWorkbookBuffer(fileName, ab, (props ?? []) as { id: string; name: string | null }[]);

  const year = yearRaw ? Number(yearRaw) : parsed.detectedYear ?? new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  const importMode: VarjoImportMode = ["budget", "actuals", "both"].includes(mode) ? mode : "both";

  const summary = await executeVarjoBudgetImport(supabase, parsed, {
    tenantId,
    year,
    budgetType,
    mode: importMode,
    overwrite,
    userId: user.id,
  });

  return NextResponse.json({
    ok: summary.errors.length === 0,
    summary,
    skippedSheets: parsed.skippedSheets,
    unmappedSheets: parsed.propertySheets.filter((s) => s.status === "unmapped").map((s) => s.sheetName),
    warnings: parsed.warnings,
  });
}
