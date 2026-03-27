import { NextResponse } from "next/server";
import { templateCsv } from "@/lib/historical-import/templates";
import type { ImportType } from "@/lib/historical-import/types";

const ALLOWED: ImportType[] = ["revenue", "costs", "invoices", "occupancy"];

export async function GET(req: Request) {
  const u = new URL(req.url);
  const t = (u.searchParams.get("type") ?? "revenue").trim() as ImportType;
  if (!ALLOWED.includes(t)) return NextResponse.json({ error: "Invalid type" }, { status: 400 });

  return new NextResponse(templateCsv(t), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="historical_${t}_template.csv"`,
    },
  });
}
