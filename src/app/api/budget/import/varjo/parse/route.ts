import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMembershipContext, userCanViewBudget } from "@/lib/budget/server-access";
import { buildVarjoPreviewRows } from "@/lib/budget/varjo-xlsx/preview";
import { parseVarjoWorkbookBuffer } from "@/lib/budget/varjo-xlsx/parse-workbook";
import type { VarjoImportMode } from "@/lib/budget/varjo-xlsx/merge-sections";

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
  const mode = (String(form.get("mode") ?? "both").trim() as VarjoImportMode) || "both";

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

  const year = parsed.detectedYear ?? new Date().getFullYear();
  const previewMode: VarjoImportMode = ["budget", "actuals", "both"].includes(mode) ? mode : "both";
  const previewRows = buildVarjoPreviewRows(parsed, previewMode);

  return NextResponse.json({
    ...parsed,
    suggestedYear: year,
    previewMode,
    previewRows: previewRows.slice(0, 240),
    unmappedPropertySheets: parsed.propertySheets.filter((s) => s.status === "unmapped").map((s) => s.sheetName),
  });
}
