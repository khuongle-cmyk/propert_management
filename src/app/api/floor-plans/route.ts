import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const propertyId = url.searchParams.get("propertyId")?.trim();

  let q = supabase
    .from("floor_plans")
    .select("id, tenant_id, property_id, name, floor_number, status, updated_at")
    .order("updated_at", { ascending: false });

  if (propertyId) q = q.eq("property_id", propertyId);

  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const propIds = [...new Set((rows ?? []).map((r: { property_id: string }) => r.property_id))];
  const nameByProp: Record<string, string | null> = {};
  if (propIds.length) {
    const { data: props } = await supabase.from("properties").select("id, name").in("id", propIds);
    for (const p of props ?? []) nameByProp[p.id as string] = (p.name as string | null) ?? null;
  }

  const planIds = (rows ?? []).map((r: { id: string }) => r.id);
  let roomCounts: Record<string, number> = {};
  if (planIds.length) {
    const { data: roomsAgg, error: cErr } = await supabase
      .from("floor_plan_rooms")
      .select("floor_plan_id")
      .in("floor_plan_id", planIds);
    if (!cErr && roomsAgg) {
      roomCounts = roomsAgg.reduce<Record<string, number>>((acc, r: { floor_plan_id: string }) => {
        acc[r.floor_plan_id] = (acc[r.floor_plan_id] ?? 0) + 1;
        return acc;
      }, {});
    }
  }

  const list = (rows ?? []).map((r: { id: string; property_id: string }) => ({
    ...r,
    property_name: nameByProp[r.property_id] ?? null,
    room_count: roomCounts[r.id] ?? 0,
  }));

  return NextResponse.json({ floorPlans: list });
}

type PostBody = {
  propertyId?: string;
  name?: string;
  floorNumber?: number;
  widthMeters?: number;
  heightMeters?: number;
  scale?: number;
  backgroundImageUrl?: string | null;
};

export async function POST(req: Request) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const propertyId = body.propertyId?.trim();
  const name = body.name?.trim() || "Untitled floor plan";
  if (!propertyId) return NextResponse.json({ error: "propertyId is required" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: prop, error: pErr } = await supabase
    .from("properties")
    .select("id, tenant_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!prop?.tenant_id) return NextResponse.json({ error: "Property not found" }, { status: 404 });

  const { data: userRow } = await supabase.from("users").select("id").eq("id", user.id).maybeSingle();
  const createdBy = userRow?.id ?? null;

  const insert = {
    tenant_id: prop.tenant_id,
    property_id: propertyId,
    name,
    floor_number: body.floorNumber ?? 0,
    width_meters: body.widthMeters ?? 20,
    height_meters: body.heightMeters ?? 15,
    scale: body.scale ?? 100,
    background_image_url: body.backgroundImageUrl ?? null,
    status: "draft" as const,
    created_by: createdBy,
    canvas_data: {},
  };

  const { data: created, error: insErr } = await supabase.from("floor_plans").insert(insert).select("id").maybeSingle();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
  return NextResponse.json({ id: created?.id });
}
