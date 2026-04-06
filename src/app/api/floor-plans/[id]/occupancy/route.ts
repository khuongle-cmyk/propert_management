import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OccupancyKind } from "@/lib/floor-plans/constants";

function normalizeSpaceStatus(raw: string | null | undefined): OccupancyKind {
  const s = (raw ?? "").toLowerCase();
  if (s === "occupied") return "occupied";
  if (s === "reserved") return "reserved";
  if (s === "available" || s === "vacant") return "available";
  return "available";
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: floorPlanId } = await params;
  if (!floorPlanId?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: plan, error: pErr } = await supabase
    .from("floor_plans")
    .select("id, name, property_id, floor_number, status, width_meters, height_meters, scale")
    .eq("id", floorPlanId)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: rooms, error: rErr } = await supabase.from("floor_plan_rooms").select("*").eq("floor_plan_id", floorPlanId);
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const spaceIds = [...new Set((rooms ?? []).map((r) => r.bookable_space_id as string | null).filter(Boolean))] as string[];

  const spaceById: Record<
    string,
    {
      id: string;
      name: string | null;
      space_status: string | null;
      monthly_rent_eur: number | null;
      size_m2: number | null;
      capacity: number | null;
      tenant_company_name: string | null;
    }
  > = {};

  if (spaceIds.length) {
    const { data: spaces, error: sErr } = await supabase
      .from("bookable_spaces")
      .select("id, name, space_status, monthly_rent_eur, size_m2, capacity, tenant_company_name")
      .in("id", spaceIds);
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
    for (const s of spaces ?? []) {
      spaceById[s.id as string] = {
        id: s.id as string,
        name: (s.name as string) ?? null,
        space_status: (s.space_status as string) ?? null,
        monthly_rent_eur: s.monthly_rent_eur != null ? Number(s.monthly_rent_eur) : null,
        size_m2: s.size_m2 != null ? Number(s.size_m2) : null,
        capacity: s.capacity != null ? Number(s.capacity) : null,
        tenant_company_name: (s.tenant_company_name as string) ?? null,
      };
    }
  }

  const contractBySpace: Record<
    string,
    { status: string; end_date: string | null; monthly_rent: number; tenant_label: string | null }
  > = {};

  if (spaceIds.length) {
    const { data: items, error: iErr } = await supabase
      .from("room_contract_items")
      .select("space_id, monthly_rent, contract_id")
      .in("space_id", spaceIds);
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    const contractIds = [...new Set((items ?? []).map((it) => it.contract_id as string).filter(Boolean))];
    let contracts: Array<{ id: string; status: string; end_date: string | null; lead_id: string | null }> = [];
    if (contractIds.length) {
      const { data: cRows, error: cErr } = await supabase
        .from("room_contracts")
        .select("id, status, end_date, lead_id")
        .in("id", contractIds);
      if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
      contracts = (cRows ?? []) as typeof contracts;
    }
    const contractMap = Object.fromEntries(contracts.map((c) => [c.id, c]));

    const leadIds = [...new Set(contracts.map((c) => c.lead_id).filter(Boolean))] as string[];
    const leadName: Record<string, string> = {};
    if (leadIds.length) {
      const { data: leads } = await supabase.from("customer_companies").select("id, name").in("id", leadIds);
      for (const L of leads ?? []) leadName[L.id as string] = (L.name as string) || "";
    }

    for (const it of items ?? []) {
      const sid = it.space_id as string;
      const cid = it.contract_id as string;
      const rc = contractMap[cid];
      if (!rc) continue;
      const rent = Number(it.monthly_rent) || 0;
      const tenantLabel = rc.lead_id ? leadName[rc.lead_id] || null : null;
      const prev = contractBySpace[sid];
      const rank = (st: string) => (st === "active" ? 2 : st === "draft" ? 1 : 0);
      if (!prev || rank(rc.status ?? "") > rank(prev.status)) {
        contractBySpace[sid] = {
          status: rc.status ?? "",
          end_date: rc.end_date ?? null,
          monthly_rent: rent,
          tenant_label: tenantLabel,
        };
      }
    }
  }

  const enriched = (rooms ?? []).map((room) => {
    const meta = (room.metadata ?? {}) as { size_m2?: number; capacity?: number };
    if (!room.is_rentable) {
      return {
        ...room,
        occupancy: "not_rentable" as const,
        space: null,
        contract: null,
      };
    }
    const sid = room.bookable_space_id as string | null;
    if (!sid || !spaceById[sid]) {
      return {
        ...room,
        occupancy: "unlinked" as const,
        space: null,
        contract: null,
        display_size_m2: meta.size_m2 ?? null,
        display_capacity: meta.capacity ?? null,
      };
    }
    const sp = spaceById[sid];
    const ct = contractBySpace[sid];
    let occupancy: OccupancyKind = normalizeSpaceStatus(sp.space_status);
    if (ct?.status === "draft") occupancy = "reserved";
    if (ct?.status === "active") occupancy = "occupied";

    return {
      ...room,
      occupancy,
      space: sp,
      contract: ct
        ? {
            status: ct.status,
            end_date: ct.end_date,
            monthly_rent: ct.monthly_rent,
            tenant_name: ct.tenant_label ?? sp.tenant_company_name,
          }
        : null,
      display_size_m2: sp.size_m2 ?? meta.size_m2 ?? null,
      display_capacity: sp.capacity ?? meta.capacity ?? null,
      display_rent: sp.monthly_rent_eur ?? ct?.monthly_rent ?? null,
    };
  });

  return NextResponse.json({
    plan,
    rooms: enriched,
  });
}
