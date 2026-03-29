import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parseDxfString } from "@/lib/floor-plans/parse-dxf";

export const runtime = "nodejs";

const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const name = file.name?.toLowerCase() ?? "";
  if (!name.endsWith(".dxf")) {
    return NextResponse.json({ error: "File must be a .dxf file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 400 });
  }

  const tw = Math.max(200, Math.min(8000, Number(formData.get("targetWidth")) || 1000));
  const th = Math.max(200, Math.min(8000, Number(formData.get("targetHeight")) || 800));

  const text = await file.text();
  try {
    const result = parseDxfString(text, tw, th);
    const scaleHint =
      result.summary.wallSegments + result.summary.closedRooms + result.summary.textLabels + result.summary.dimensions > 0
        ? `Drawing width ≈ ${(result.drawingUnitsPerTargetWidth * (tw - 48)).toFixed(1)} units → ${tw}px (fit). Typical architectural DXF in mm: divide by 1000 for metres.`
        : "";

    return NextResponse.json({
      ...result,
      scaleHint,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "DXF parse failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
