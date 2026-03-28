import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeMemberships } from "@/lib/reports/report-access";
import { eachMonthKeyInclusive } from "@/lib/reports/rent-roll-builder";
import { loadRentRollSourceRows } from "@/lib/reports/rent-roll-data";
import { buildNetIncomeReport } from "@/lib/reports/net-income-builder";
import { loadNetIncomeAlignedCostsForMonth } from "@/lib/reports/net-income-preview-costs";
import type { PropertyRevenueBreakdown } from "@/lib/reports/net-income-types";

function parseMonthKey(mk: string): { year: number; month: number } | null {
  const parts = mk.split("-");
  if (parts.length < 2) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * Parse "YYYY-MM" (first two `-` segments) into year/month integers.
 * Same idea as: const [yearStr, monthStr] = month_key.split('-'); parseInt(...)
 */
function parseYearMonthFromKey(monthKey: string): { yearNum: number; monthNum: number } | null {
  const trimmed = monthKey.trim();
  const [yearStr, monthStr] = trimmed.split("-");
  if (!yearStr || monthStr === undefined) return null;
  const yearNum = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);
  if (!Number.isFinite(yearNum) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) {
    return null;
  }
  return { yearNum, monthNum };
}

/**
 * Build basis amounts (€) for admin-fee % preview — revenue lines from net-income report.
 * total_costs / hr_costs come from loadNetIncomeAlignedCostsForMonth (same pipeline as POST /api/reports/net-income).
 */
function basisAmountsFromRevenueAndCosts(revenue: PropertyRevenueBreakdown, costsTotal: number): Record<string, number> {
  return {
    total_revenue: revenue.total,
    total_costs: costsTotal,
    office_rent_only: revenue.office,
    meeting_room_revenue: revenue.meeting,
    hot_desk_revenue: revenue.hotDesk,
    virtual_office_revenue: revenue.virtualOffice,
    furniture_revenue: revenue.furniture,
    additional_services_revenue: revenue.additionalServices,
    hr_costs: 0,
  };
}

/**
 * GET /api/admin-fees/preview-basis?tenant_id=X&property_id=optional&month_key=YYYY-MM
 */
export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membershipRows, error: mErr } = await supabase
    .from("memberships")
    .select("tenant_id, role")
    .eq("user_id", user.id);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

  const { isSuperAdmin, scopedTenantIds } = normalizeMemberships(
    (membershipRows ?? []) as { tenant_id: string | null; role: string | null }[],
  );

  const url = new URL(req.url);
  const tenantId = (url.searchParams.get("tenant_id") ?? "").trim();
  const propertyId = (url.searchParams.get("property_id") ?? "").trim() || null;
  const monthKeyOverride = (url.searchParams.get("month_key") ?? "").trim();

  if (!tenantId) {
    return NextResponse.json({ error: "tenant_id is required" }, { status: 400 });
  }

  if (!isSuperAdmin && !scopedTenantIds.includes(tenantId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: props, error: pErr } = await supabase
    .from("properties")
    .select("id")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const ids = ((props ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) {
    const empty = {
      monthKey: null as string | null,
      basisAmounts: {} as Record<string, number>,
      revenueTotal: 0,
      officeRent: 0,
      totalCosts: 0,
      note: "No properties for tenant",
    };
    return NextResponse.json(empty);
  }

  if (propertyId && !ids.includes(propertyId)) {
    return NextResponse.json({ error: "property_id is not in this tenant" }, { status: 400 });
  }

  const end = new Date();
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1));
  let startStr = start.toISOString().slice(0, 10);
  let endStr = end.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(monthKeyOverride)) {
    const parsed = parseMonthKey(monthKeyOverride);
    if (parsed) {
      const forcedStart = new Date(Date.UTC(parsed.year, parsed.month - 1, 1));
      const forcedEnd = new Date(Date.UTC(parsed.year, parsed.month, 0, 23, 59, 59, 999));
      const rollingStart = new Date(startStr + "T00:00:00.000Z");
      const rollingEnd = new Date(endStr + "T23:59:59.999Z");
      if (forcedStart < rollingStart) {
        startStr = `${parsed.year}-${String(parsed.month).padStart(2, "0")}-01`;
      }
      if (forcedEnd > rollingEnd) {
        endStr = forcedEnd.toISOString().slice(0, 10);
      }
    }
  }
  const monthKeys = eachMonthKeyInclusive(startStr, endStr);
  if (monthKeys.length === 0) {
    return NextResponse.json({
      monthKey: null,
      basisAmounts: {},
      revenueTotal: 0,
      officeRent: 0,
      totalCosts: 0,
    });
  }

  const { source, error: loadErr } = await loadRentRollSourceRows(supabase, ids, monthKeys);
  if (loadErr || !source) {
    return NextResponse.json({ error: loadErr ?? "Load failed" }, { status: 500 });
  }

  const report = buildNetIncomeReport(monthKeys, source, [], {});
  let best: { monthKey: string; rev: number; costs: number } | null = null;
  for (const pm of report.portfolioByMonth) {
    const activity = pm.revenue.total + pm.costs.total;
    if (!best || activity > best.rev + best.costs) {
      best = {
        monthKey: pm.monthKey,
        rev: pm.revenue.total,
        costs: pm.costs.total,
      };
    }
  }

  const pickMonthKey = (): string | null => {
    if (best && best.rev + best.costs > 0) return best.monthKey;
    const last = report.portfolioByMonth[report.portfolioByMonth.length - 1];
    return last?.monthKey ?? monthKeys[monthKeys.length - 1] ?? null;
  };

  let mk: string | null = /^\d{4}-\d{2}$/.test(monthKeyOverride) ? monthKeyOverride : pickMonthKey();
  let noteOverride: string | undefined =
    mk && monthKeyOverride && mk === monthKeyOverride ? "Preview month set via month_key" : undefined;
  if (!mk) {
    return NextResponse.json({
      monthKey: null,
      basisAmounts: {},
      revenueTotal: 0,
      officeRent: 0,
      totalCosts: 0,
    });
  }

  const pm = report.portfolioByMonth.find((x) => x.monthKey === mk);
  if (!pm) {
    return NextResponse.json({ error: `No report data for month ${mk}` }, { status: 404 });
  }

  let basisAmounts: Record<string, number>;
  let note: string | undefined;

  if (propertyId) {
    const row = report.rows.find((r) => r.propertyId === propertyId && r.monthKey === mk);
    if (row) {
      basisAmounts = basisAmountsFromRevenueAndCosts(row.revenue, row.costs.total);
    } else {
      basisAmounts = basisAmountsFromRevenueAndCosts(pm.revenue, pm.costs.total);
      note = "Property had no row for that month — using portfolio totals for revenue lines";
    }
  } else {
    basisAmounts = basisAmountsFromRevenueAndCosts(pm.revenue, pm.costs.total);
  }

  if (best && best.rev + best.costs === 0) {
    note = note ?? "Using last month in range (little activity)";
  }
  if (noteOverride) {
    note = note ? `${noteOverride} · ${note}` : noteOverride;
  }

  /** Month used for costs — prefer explicit month_key, else selected report month */
  const costsMonthKey = /^\d{4}-\d{2}$/.test(monthKeyOverride) ? monthKeyOverride : mk;
  const ym = parseYearMonthFromKey(costsMonthKey);
  let totalCosts = 0;
  if (ym) {
    const propIdsForCosts = propertyId ? [propertyId] : ids;
    try {
      const admin = getSupabaseAdminClient();
      const aligned = await loadNetIncomeAlignedCostsForMonth(admin, costsMonthKey, propIdsForCosts);
      if (aligned.error) {
        basisAmounts = { ...basisAmounts, total_costs: 0, hr_costs: 0 };
        note = note
          ? `${note} · Net-income-aligned costs failed: ${aligned.error}`
          : `Net-income-aligned costs failed: ${aligned.error}`;
      } else {
        totalCosts = aligned.totalCosts;
        basisAmounts = {
          ...basisAmounts,
          total_costs: aligned.totalCosts,
          hr_costs: aligned.hrStaffBasis,
        };
      }
    } catch (e) {
      basisAmounts = { ...basisAmounts, total_costs: 0, hr_costs: 0 };
      const msg = e instanceof Error ? e.message : String(e);
      note = note ? `${note} · Costs load error: ${msg}` : `Costs load error: ${msg}`;
    }
  } else {
    basisAmounts = { ...basisAmounts, total_costs: 0, hr_costs: 0 };
    note = note ? `${note} · Invalid month key for costs` : "Invalid month key for costs";
  }

  const revenueTotal = basisAmounts.total_revenue ?? 0;
  const officeRent = basisAmounts.office_rent_only ?? 0;

  return NextResponse.json({
    monthKey: mk,
    basisAmounts,
    revenueTotal,
    officeRent,
    totalCosts,
    note,
    costsMonthKey,
    costsYearMonth: ym ? { year: ym.yearNum, month: ym.monthNum } : null,
  });
}
