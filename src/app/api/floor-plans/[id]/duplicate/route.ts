import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plan, error: pErr } = await supabase.from("floor_plans").select("*").eq("id", id).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: userRow } = await supabase.from("users").select("id").eq("id", user.id).maybeSingle();
  const createdBy = userRow?.id ?? null;

  const insert = {
    tenant_id: plan.tenant_id,
    property_id: plan.property_id,
    name: `${String(plan.name ?? "Plan")} (copy)`,
    floor_number: plan.floor_number,
    width_meters: plan.width_meters,
    height_meters: plan.height_meters,
    scale: plan.scale,
    background_image_url: plan.background_image_url,
    background_opacity: plan.background_opacity ?? 0.5,
    show_background: plan.show_background ?? true,
    canvas_data: plan.canvas_data ?? {},
    status: "draft" as const,
    created_by: createdBy,
  };

  const { data: created, error: insErr } = await supabase.from("floor_plans").insert(insert).select("id").maybeSingle();
  if (insErr || !created?.id) return NextResponse.json({ error: insErr?.message ?? "Insert failed" }, { status: 400 });
  const newId = created.id as string;

  const { data: rooms } = await supabase.from("floor_plan_rooms").select("*").eq("floor_plan_id", id);
  const { data: elements } = await supabase.from("floor_plan_elements").select("*").eq("floor_plan_id", id);

  const idMap = new Map<string, string>();
  for (const r of rooms ?? []) {
    const oldId = r.id as string;
    const newRoomId = crypto.randomUUID();
    idMap.set(oldId, newRoomId);
  }

  if (rooms?.length) {
    const rows = rooms.map((r) => {
      const oldId = r.id as string;
      const { id: _rid, created_at: _rc, updated_at: _ru, floor_plan_id: _fp, ...rrest } = r as Record<string, unknown>;
      return {
        ...rrest,
        id: idMap.get(oldId),
        floor_plan_id: newId,
        bookable_space_id: null,
      };
    });
    const { error: rErr } = await supabase.from("floor_plan_rooms").insert(rows);
    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 });
  }

  if (elements?.length) {
    const rows = elements.map((el) => {
      const { id: _eid, created_at: _ec, floor_plan_id: _efp, ...erest } = el as Record<string, unknown>;
      return {
        ...erest,
        id: crypto.randomUUID(),
        floor_plan_id: newId,
      };
    });
    const { error: eErr } = await supabase.from("floor_plan_elements").insert(rows);
    if (eErr) return NextResponse.json({ error: eErr.message }, { status: 400 });
  }

  return NextResponse.json({ id: newId });
}
