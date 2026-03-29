import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roomTypeToBookableSpaceType, type RoomMetadata } from "@/lib/floor-plans/constants";

type Body = { roomIds?: string[] };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: floorPlanId } = await params;
  if (!floorPlanId?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: Body = {};
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = (await req.json()) as Body;
    }
  } catch {
    body = {};
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plan, error: pErr } = await supabase.from("floor_plans").select("id, property_id, floor_number").eq("id", floorPlanId).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const propertyId = plan.property_id as string;
  const floorNum = plan.floor_number as number;

  let q = supabase
    .from("floor_plan_rooms")
    .select("id, room_name, room_number, room_type, is_rentable, bookable_space_id, metadata")
    .eq("floor_plan_id", floorPlanId)
    .is("bookable_space_id", null)
    .eq("is_rentable", true);

  if (body.roomIds?.length) q = q.in("id", body.roomIds);

  const { data: toImport, error: rErr } = await q;
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!toImport?.length) {
    return NextResponse.json({ ok: true, imported: 0, message: "No rooms to import" });
  }

  const results: { roomId: string; spaceId?: string; error?: string }[] = [];

  for (const room of toImport) {
    const meta = (room.metadata ?? {}) as RoomMetadata;
    const capacity = Math.max(1, Math.round(Number(meta.capacity ?? 1)));
    const spaceType = roomTypeToBookableSpaceType(String(room.room_type));
    const name = String(room.room_name || room.room_number || "Space").trim() || "Space";
    const roomNumber = String(room.room_number ?? "").trim() || null;

    const insertSpace = {
      property_id: propertyId,
      name,
      space_type: spaceType,
      capacity,
      floor: String(floorNum),
      room_number: roomNumber,
      hourly_price: 0,
      space_status: "available",
      is_published: true,
      size_m2: meta.size_m2 != null ? Number(meta.size_m2) : null,
      amenity_whiteboard: Boolean(meta.amenities?.whiteboard),
      amenity_projector: Boolean(meta.amenities?.tv_projector),
      amenity_video_conferencing: Boolean(meta.amenities?.video_conferencing),
      amenity_natural_light: Boolean(meta.amenities?.natural_light),
    };

    const { data: space, error: insErr } = await supabase.from("bookable_spaces").insert(insertSpace).select("id").maybeSingle();
    if (insErr || !space?.id) {
      results.push({ roomId: room.id as string, error: insErr?.message ?? "insert failed" });
      continue;
    }

    const { error: linkErr } = await supabase
      .from("floor_plan_rooms")
      .update({ bookable_space_id: space.id })
      .eq("id", room.id);

    if (linkErr) {
      results.push({ roomId: room.id as string, error: linkErr.message });
      continue;
    }

    results.push({ roomId: room.id as string, spaceId: space.id as string });
  }

  const ok = results.filter((r) => r.spaceId).length;
  const failed = results.filter((r) => r.error).length;

  return NextResponse.json({
    ok: true,
    imported: ok,
    failed,
    results,
  });
}
