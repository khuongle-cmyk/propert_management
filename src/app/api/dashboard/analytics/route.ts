import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { classifyHistoricalCostBucket } from "@/lib/reports/cost-classification";

function last12MonthKeysUtc(): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 11; i >= 0; i--) {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function isOfficeSpaceType(spaceType: string): boolean {
  return (spaceType ?? "").toLowerCase() === "office";
}

type RevRow = {
  property_id: string;
  year: number;
  month: number;
  office_rent_revenue: number | string | null;
  meeting_room_revenue: number | string | null;
  hot_desk_revenue: number | string | null;
  venue_revenue: number | string | null;
  additional_services_revenue: number | string | null;
  virtual_office_revenue?: number | string | null;
  furniture_revenue?: number | string | null;
  total_revenue: number | string | null;
};

type CostRow = {
  property_id: string;
  year: number;
  month: number;
  amount_ex_vat: number | string | null;
  account_code: string | null;
  cost_type: string | null;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const filterPropertyId = (searchParams.get("propertyId") ?? "").trim();

  const { data: mem, error: mErr } = await supabase.from("memberships").select("tenant_id, role").eq("user_id", user.id);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const rows = (mem ?? []) as { tenant_id: string | null; role: string | null }[];
  const isSuperAdmin = rows.some((m) => (m.role ?? "").toLowerCase() === "super_admin");
  const ownerTenantIds = rows
    .filter((m) => (m.role ?? "").toLowerCase() === "owner")
    .map((m) => m.tenant_id)
    .filter(Boolean) as string[];

  if (!isSuperAdmin && ownerTenantIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let propQuery = supabase.from("properties").select("id, name").order("name", { ascending: true });
  if (!isSuperAdmin) propQuery = propQuery.in("tenant_id", ownerTenantIds);
  const { data: props, error: pErr } = await propQuery;
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const propertyList = (props ?? []) as { id: string; name: string | null }[];
  let propertyIds = propertyList.map((p) => p.id);
  if (filterPropertyId) {
    if (!propertyIds.includes(filterPropertyId)) {
      return NextResponse.json({ error: "Invalid property" }, { status: 400 });
    }
    propertyIds = [filterPropertyId];
  }

  const monthKeys = last12MonthKeysUtc();
  const firstMk = monthKeys[0] ?? "";
  const lastMk = monthKeys[monthKeys.length - 1] ?? "";
  const minYear = Number(firstMk.slice(0, 4));
  const maxYear = Number(lastMk.slice(0, 4));
  const now = new Date();
  const cy = now.getUTCFullYear();
  const cm = now.getUTCMonth() + 1;
  const today = now.toISOString().slice(0, 10);

  const emptyPayload = {
    monthKeys,
    kpis: {
      revenueThisMonth: 0,
      costsThisMonth: 0,
      netIncomeThisMonth: 0,
      occupancyPct: 0,
      activeContracts: 0,
      openInvoices: 0,
    },
    monthlySeries: monthKeys.map((mk) => ({
      monthKey: mk,
      label: mk.slice(5) + "/" + mk.slice(2, 4),
      revenue: 0,
      office: 0,
      meeting: 0,
      hotDesk: 0,
      venue: 0,
      virtualOffice: 0,
      furniture: 0,
      services: 0,
      costsTotal: 0,
      materialsServices: 0,
      personnel: 0,
      otherOperating: 0,
      net: 0,
    })),
    occupancyByProperty: [] as { propertyId: string; name: string; occupancyPct: number; leasedOffices: number; totalOffices: number }[],
  };

  if (propertyIds.length === 0) {
    return NextResponse.json(emptyPayload);
  }

  let revenueRows: RevRow[] = [];
  const revRes = await supabase
    .from("historical_revenue")
    .select(
      "property_id, year, month, office_rent_revenue, meeting_room_revenue, hot_desk_revenue, venue_revenue, additional_services_revenue, virtual_office_revenue, furniture_revenue, total_revenue",
    )
    .in("property_id", propertyIds)
    .gte("year", minYear)
    .lte("year", maxYear);
  if (revRes.error && revRes.error.code !== "42P01") {
    return NextResponse.json({ error: revRes.error.message }, { status: 500 });
  }
  if (!revRes.error) revenueRows = (revRes.data ?? []) as RevRow[];

  let costRows: CostRow[] = [];
  const costSel = await supabase
    .from("historical_costs")
    .select("property_id, year, month, amount_ex_vat, account_code, cost_type")
    .in("property_id", propertyIds)
    .gte("year", minYear)
    .lte("year", maxYear);
  if (costSel.error) {
    if (costSel.error.code !== "42P01" && costSel.error.code !== "42703") {
      return NextResponse.json({ error: costSel.error.message }, { status: 500 });
    }
    if (costSel.error.code === "42703") {
      const c2 = await supabase
        .from("historical_costs")
        .select("property_id, year, month, amount_ex_vat, cost_type")
        .in("property_id", propertyIds)
        .gte("year", minYear)
        .lte("year", maxYear);
      if (c2.error && c2.error.code !== "42P01") {
        return NextResponse.json({ error: c2.error.message }, { status: 500 });
      }
      costRows = ((c2.data ?? []) as Omit<CostRow, "account_code">[]).map((r) => ({ ...r, account_code: null }));
    }
  } else {
    costRows = (costSel.data ?? []) as CostRow[];
  }

  const seriesMap = new Map<
    string,
    {
      revenue: number;
      office: number;
      meeting: number;
      hotDesk: number;
      venue: number;
      virtualOffice: number;
      furniture: number;
      services: number;
      costsTotal: number;
      materialsServices: number;
      personnel: number;
      otherOperating: number;
    }
  >();
  for (const mk of monthKeys) {
    seriesMap.set(mk, {
      revenue: 0,
      office: 0,
      meeting: 0,
      hotDesk: 0,
      venue: 0,
      virtualOffice: 0,
      furniture: 0,
      services: 0,
      costsTotal: 0,
      materialsServices: 0,
      personnel: 0,
      otherOperating: 0,
    });
  }

  let revenueThisMonth = 0;
  let costsThisMonth = 0;

  for (const r of revenueRows) {
    const mk = `${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!monthKeys.includes(mk)) continue;
    const slot = seriesMap.get(mk)!;
    const office = num(r.office_rent_revenue);
    const meeting = num(r.meeting_room_revenue);
    const hotDesk = num(r.hot_desk_revenue);
    const venue = num(r.venue_revenue);
    const services = num(r.additional_services_revenue);
    const virtualOffice = num(r.virtual_office_revenue);
    const furniture = num(r.furniture_revenue);
    const total = num(r.total_revenue);
    const sumParts = office + meeting + hotDesk + venue + services + virtualOffice + furniture;
    const useTotal = total > 0 ? total : sumParts;
    slot.office += office;
    slot.meeting += meeting;
    slot.hotDesk += hotDesk;
    slot.venue += venue;
    slot.services += services;
    slot.virtualOffice += virtualOffice;
    slot.furniture += furniture;
    slot.revenue += useTotal;
    if (r.year === cy && r.month === cm) {
      revenueThisMonth += useTotal;
    }
  }

  for (const r of costRows) {
    const mk = `${r.year}-${String(r.month).padStart(2, "0")}`;
    if (!monthKeys.includes(mk)) continue;
    const amt = num(r.amount_ex_vat);
    const slot = seriesMap.get(mk)!;
    slot.costsTotal += amt;
    const bucket = classifyHistoricalCostBucket(r.account_code, r.cost_type);
    if (bucket === "materials_services") slot.materialsServices += amt;
    else if (bucket === "personnel") slot.personnel += amt;
    else slot.otherOperating += amt;
    if (r.year === cy && r.month === cm) costsThisMonth += amt;
  }

  const monthlySeries = monthKeys.map((mk) => {
    const s = seriesMap.get(mk)!;
    const net = s.revenue - s.costsTotal;
    return {
      monthKey: mk,
      label: `${mk.slice(5)}/${mk.slice(2, 4)}`,
      revenue: s.revenue,
      office: s.office,
      meeting: s.meeting,
      hotDesk: s.hotDesk,
      venue: s.venue,
      virtualOffice: s.virtualOffice,
      furniture: s.furniture,
      services: s.services,
      costsTotal: s.costsTotal,
      materialsServices: s.materialsServices,
      personnel: s.personnel,
      otherOperating: s.otherOperating,
      net,
    };
  });

  const { count: contractCount, error: cErr } = await supabase
    .from("room_contracts")
    .select("id", { count: "exact", head: true })
    .in("property_id", propertyIds)
    .eq("status", "active");
  if (cErr && cErr.code !== "42P01") {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  const activeContracts = cErr ? 0 : contractCount ?? 0;

  const { count: invCount, error: iErr } = await supabase
    .from("lease_invoices")
    .select("id", { count: "exact", head: true })
    .in("property_id", propertyIds)
    .in("status", ["draft", "sent", "overdue"]);
  if (iErr && iErr.code !== "42P01") {
    return NextResponse.json({ error: iErr.message }, { status: 500 });
  }
  const openInvoices = iErr ? 0 : invCount ?? 0;

  const occupancyByProperty: typeof emptyPayload.occupancyByProperty = [];
  let totalOfficesAll = 0;
  let leasedOfficesAll = 0;

  const { data: spaces, error: sErr } = await supabase
    .from("bookable_spaces")
    .select("id, property_id, space_type")
    .in("property_id", propertyIds);
  if (!sErr && spaces?.length) {
    const spaceRows = spaces as { id: string; property_id: string; space_type: string }[];
    let leasedSpaceIds = new Set<string>();
    const { data: contracts, error: rcErr } = await supabase
      .from("room_contracts")
      .select("id, property_id, status, start_date, end_date")
      .in("property_id", propertyIds)
      .eq("status", "active");
    if (!rcErr && contracts?.length) {
      const activeIds = (contracts as { id: string; start_date: string; end_date: string | null }[])
        .filter((c) => c.start_date <= today && (!c.end_date || c.end_date >= today))
        .map((c) => c.id);
      if (activeIds.length) {
        const { data: items } = await supabase.from("room_contract_items").select("space_id").in("contract_id", activeIds);
        leasedSpaceIds = new Set((items ?? []).map((i: { space_id: string }) => i.space_id));
      }
    }
    for (const pid of propertyIds) {
      const offices = spaceRows.filter((sp) => sp.property_id === pid && isOfficeSpaceType(sp.space_type));
      const totalOffices = offices.length;
      const leasedOffices = offices.filter((sp) => leasedSpaceIds.has(sp.id)).length;
      totalOfficesAll += totalOffices;
      leasedOfficesAll += leasedOffices;
      const occ = totalOffices > 0 ? Math.round((leasedOffices / totalOffices) * 1000) / 10 : 0;
      occupancyByProperty.push({
        propertyId: pid,
        name: propertyList.find((p) => p.id === pid)?.name ?? "Property",
        occupancyPct: occ,
        leasedOffices,
        totalOffices,
      });
    }
  }

  const occupancyPct =
    totalOfficesAll > 0 ? Math.round((leasedOfficesAll / totalOfficesAll) * 1000) / 10 : 0;

  return NextResponse.json({
    monthKeys,
    kpis: {
      revenueThisMonth,
      costsThisMonth,
      netIncomeThisMonth: revenueThisMonth - costsThisMonth,
      occupancyPct,
      activeContracts,
      openInvoices,
    },
    monthlySeries,
    occupancyByProperty,
  });
}
