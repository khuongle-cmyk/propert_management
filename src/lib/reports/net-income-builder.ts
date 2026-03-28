import { buildRentRollReport } from "./rent-roll-builder";
import type { RentRollSourceRows } from "./rent-roll-builder";
import {
  computeCostsTotal,
  costBucketForEntry,
  emptyNetIncomeCostBreakdown,
} from "./net-income-cost-accounts";
import type {
  NetIncomeMonthRow,
  NetIncomeReportModel,
  PropertyCostBreakdown,
  PropertyCostEntryRow,
  PropertyRevenueBreakdown,
} from "./net-income-types";
import type { ReportSections } from "./rent-roll-types";

const REVENUE_SECTIONS: ReportSections = {
  officeRents: true,
  meetingRoomRevenue: true,
  hotDeskRevenue: true,
  venueRevenue: true,
  additionalServices: true,
  virtualOfficeRevenue: true,
  furnitureRevenue: true,
  vacancyForecast: false,
  revenueVsTarget: false,
  roomByRoom: false,
  tenantByTenant: false,
  monthlySummary: false,
  showCosts: false,
};

function emptyRevenue(): PropertyRevenueBreakdown {
  return {
    office: 0,
    meeting: 0,
    hotDesk: 0,
    venue: 0,
    virtualOffice: 0,
    furniture: 0,
    additionalServices: 0,
    total: 0,
  };
}

function recomputeRevenueTotal(cur: PropertyRevenueBreakdown) {
  cur.total =
    cur.office +
    cur.meeting +
    cur.hotDesk +
    cur.venue +
    cur.virtualOffice +
    cur.furniture +
    cur.additionalServices;
}

function monthKeyFromDate(d: string): string {
  const x = new Date(`${d.trim().slice(0, 10)}T12:00:00.000Z`);
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Per property / calendar month revenue: operational data + historical_revenue (P&L imports).
 */
function propertyMonthRevenueMap(
  monthKeys: string[],
  source: RentRollSourceRows,
): Map<string, PropertyRevenueBreakdown> {
  const rrBuild = buildRentRollReport(monthKeys, REVENUE_SECTIONS, null, source);
  const map = new Map<string, PropertyRevenueBreakdown>();

  function key(pid: string, mk: string) {
    return `${pid}|${mk}`;
  }

  function bump(pid: string, mk: string, part: keyof Omit<PropertyRevenueBreakdown, "total">, amt: number) {
    const k = key(pid, mk);
    const cur = map.get(k) ?? emptyRevenue();
    cur[part] += amt;
    recomputeRevenueTotal(cur);
    map.set(k, cur);
  }

  for (const o of rrBuild.officeRentRoll) {
    bump(o.propertyId, o.monthKey, "office", o.contractMonthlyRent);
  }

  const { spaces } = source;
  const spaceById = new Map(spaces.map((s) => [s.id, s]));
  const normalizeSpaceType = (t: string) => {
    if (t === "meeting_room") return "conference_room";
    if (t === "desk") return "hot_desk";
    return t;
  };

  for (const b of source.bookings) {
    if (b.status !== "confirmed") continue;
    const sp = spaceById.get(b.space_id);
    if (!sp) continue;
    const st = normalizeSpaceType(sp.space_type);
    const t = new Date(b.start_at);
    const mk = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthKeys.includes(mk)) continue;
    const amt = Number(b.total_price) || 0;
    if (st === "conference_room") bump(b.property_id, mk, "meeting", amt);
    else if (st === "hot_desk") bump(b.property_id, mk, "hotDesk", amt);
    else if (st === "venue") bump(b.property_id, mk, "venue", amt);
  }

  for (const s of source.additionalServices) {
    const d = new Date(s.billing_month);
    const mk = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (!monthKeys.includes(mk)) continue;
    bump(s.property_id, mk, "additionalServices", (Number(s.unit_price) || 0) * (Number(s.quantity_used) || 0));
  }

  for (const hr of source.historicalRevenue ?? []) {
    const mk = `${hr.year}-${String(hr.month).padStart(2, "0")}`;
    if (!monthKeys.includes(mk)) continue;
    const pid = hr.property_id;
    bump(pid, mk, "office", Number(hr.office_rent_revenue) || 0);
    bump(pid, mk, "meeting", Number(hr.meeting_room_revenue) || 0);
    bump(pid, mk, "hotDesk", Number(hr.hot_desk_revenue) || 0);
    bump(pid, mk, "venue", Number(hr.venue_revenue) || 0);
    bump(pid, mk, "additionalServices", Number(hr.additional_services_revenue) || 0);
    bump(pid, mk, "virtualOffice", Number((hr as { virtual_office_revenue?: number }).virtual_office_revenue) || 0);
    bump(pid, mk, "furniture", Number((hr as { furniture_revenue?: number }).furniture_revenue) || 0);

    const k = key(pid, mk);
    const cur = map.get(k) ?? emptyRevenue();
    const authTotal = Number((hr as { total_revenue?: number }).total_revenue) || 0;
    if (authTotal > 0) {
      cur.total = authTotal;
    } else {
      recomputeRevenueTotal(cur);
    }
    map.set(k, cur);
  }

  return map;
}

/** Same aggregation as the net income report (property_cost_entries + historical, buckets + computeCostsTotal). */
export function costBreakdownFromEntries(
  entries: PropertyCostEntryRow[],
  monthKeys: string[],
  propertyIds: string[],
): Map<string, { costs: PropertyCostBreakdown; scheduled: number; confirmed: number }> {
  const map = new Map<string, { costs: PropertyCostBreakdown; scheduled: number; confirmed: number }>();

  function k(pid: string, mk: string) {
    return `${pid}|${mk}`;
  }

  for (const pid of propertyIds) {
    for (const mk of monthKeys) {
      map.set(k(pid, mk), { costs: emptyNetIncomeCostBreakdown(), scheduled: 0, confirmed: 0 });
    }
  }

  for (const e of entries) {
    if (e.status === "cancelled") continue;
    if (e.cost_scope === "administration") continue;
    if (!e.property_id) continue;
    const mk = monthKeyFromDate(e.period_month);
    if (!monthKeys.includes(mk)) continue;
    const keyStr = k(e.property_id, mk);
    if (!map.has(keyStr)) continue;
    const row = map.get(keyStr)!;
    const ct = typeof e.cost_type === "string" ? e.cost_type : "one_off";
    const bucket = costBucketForEntry(e.account_code ?? null, ct);
    const amt = Number(e.amount) || 0;
    row.costs[bucket] += amt;
    row.costs.total = computeCostsTotal(row.costs);
    if (e.status === "scheduled") row.scheduled += amt;
    if (e.status === "confirmed") row.confirmed += amt;
    map.set(keyStr, row);
  }

  return map;
}

function administrationCostByMonth(
  entries: PropertyCostEntryRow[],
  monthKeys: string[],
): Map<string, PropertyCostBreakdown> {
  const map = new Map<string, PropertyCostBreakdown>();
  for (const mk of monthKeys) {
    map.set(mk, emptyNetIncomeCostBreakdown());
  }
  for (const e of entries) {
    if (e.cost_scope !== "administration") continue;
    if (e.status === "cancelled") continue;
    const mk = monthKeyFromDate(e.period_month);
    if (!monthKeys.includes(mk)) continue;
    const row = map.get(mk) ?? emptyNetIncomeCostBreakdown();
    const ct = typeof e.cost_type === "string" ? e.cost_type : "one_off";
    const bucket = costBucketForEntry(e.account_code ?? null, ct);
    const amt = Number(e.amount) || 0;
    row[bucket] += amt;
    row.total = computeCostsTotal(row);
    map.set(mk, row);
  }
  return map;
}

export type BuildNetIncomeOptions = {
  includeAdministrationInTrueNet?: boolean;
  allocateAdminByRevenueShare?: boolean;
  /** Merged with costEntries where cost_scope === administration */
  administrationEntries?: PropertyCostEntryRow[];
};

export function buildNetIncomeReport(
  monthKeys: string[],
  source: RentRollSourceRows,
  costEntries: PropertyCostEntryRow[],
  options?: BuildNetIncomeOptions,
): NetIncomeReportModel {
  const properties = source.properties.map((p) => ({
    id: p.id,
    name: p.name ?? "",
    city: p.city ?? null,
  }));
  const propertyIds = properties.map((p) => p.id);
  const revMap = propertyMonthRevenueMap(monthKeys, source);
  const costMap = costBreakdownFromEntries(costEntries, monthKeys, propertyIds);

  const adminSeen = new Set<string>();
  const adminEntryList: PropertyCostEntryRow[] = [];
  for (const e of [...(options?.administrationEntries ?? []), ...costEntries.filter((x) => x.cost_scope === "administration")]) {
    if (adminSeen.has(e.id)) continue;
    adminSeen.add(e.id);
    adminEntryList.push(e);
  }
  const adminByMonth = administrationCostByMonth(adminEntryList, monthKeys);

  const rows: NetIncomeMonthRow[] = [];
  for (const p of properties) {
    for (const mk of monthKeys) {
      const rk = `${p.id}|${mk}`;
      const revenue = revMap.get(rk) ?? emptyRevenue();
      const ce = costMap.get(rk) ?? { costs: emptyNetIncomeCostBreakdown(), scheduled: 0, confirmed: 0 };
      const netIncome = revenue.total - ce.costs.total;
      const netMarginPct =
        revenue.total > 0 ? (netIncome / revenue.total) * 100 : revenue.total === 0 && netIncome === 0 ? 0 : null;

      rows.push({
        propertyId: p.id,
        propertyName: p.name,
        monthKey: mk,
        revenue,
        costs: ce.costs,
        netIncome,
        netMarginPct,
        costsScheduled: ce.scheduled,
        costsConfirmed: ce.confirmed,
      });
    }
  }

  const costKeys = Object.keys(emptyNetIncomeCostBreakdown()).filter((x) => x !== "total") as (keyof Omit<
    PropertyCostBreakdown,
    "total"
  >)[];

  const portfolioByMonth = monthKeys.map((mk) => {
    const slice = rows.filter((r) => r.monthKey === mk);
    const revenue = emptyRevenue();
    const costs = emptyNetIncomeCostBreakdown();
    for (const r of slice) {
      revenue.office += r.revenue.office;
      revenue.meeting += r.revenue.meeting;
      revenue.hotDesk += r.revenue.hotDesk;
      revenue.venue += r.revenue.venue;
      revenue.virtualOffice += r.revenue.virtualOffice;
      revenue.furniture += r.revenue.furniture;
      revenue.additionalServices += r.revenue.additionalServices;
      for (const ck of costKeys) {
        costs[ck] += r.costs[ck];
      }
    }
    revenue.total = slice.reduce((s, r) => s + r.revenue.total, 0);
    costs.total = computeCostsTotal(costs);
    const netIncome = revenue.total - costs.total;
    const netMarginPct =
      revenue.total > 0 ? (netIncome / revenue.total) * 100 : revenue.total === 0 && netIncome === 0 ? 0 : null;
    return { monthKey: mk, revenue, costs, netIncome, netMarginPct };
  });

  if (options?.allocateAdminByRevenueShare && options?.includeAdministrationInTrueNet) {
    for (const row of rows) {
      const pm = portfolioByMonth.find((x) => x.monthKey === row.monthKey);
      const portfolioRev = pm?.revenue.total ?? 0;
      const adminTotal = adminByMonth.get(row.monthKey)?.total ?? 0;
      const allocated =
        portfolioRev > 0 && adminTotal > 0 ? adminTotal * (row.revenue.total / portfolioRev) : 0;
      row.allocatedAdministrationCost = allocated;
      row.netIncomeAfterAdminAllocation = row.netIncome - allocated;
    }
  }

  let administrationByMonth: NetIncomeReportModel["administrationByMonth"];
  let trueNetPortfolioByMonth: NetIncomeReportModel["trueNetPortfolioByMonth"];
  if (options?.includeAdministrationInTrueNet) {
    administrationByMonth = monthKeys.map((mk) => {
      const costs = adminByMonth.get(mk) ?? emptyNetIncomeCostBreakdown();
      return { monthKey: mk, costs, total: costs.total };
    });
    trueNetPortfolioByMonth = monthKeys.map((mk) => {
      const p = portfolioByMonth.find((x) => x.monthKey === mk)!;
      const adminTotal = adminByMonth.get(mk)?.total ?? 0;
      const netIncome = p.netIncome - adminTotal;
      const netMarginPct =
        p.revenue.total > 0 ? (netIncome / p.revenue.total) * 100 : p.revenue.total === 0 && netIncome === 0 ? 0 : null;
      return {
        monthKey: mk,
        propertyNoi: p.netIncome,
        administrationTotal: adminTotal,
        netIncome,
        netMarginPct,
      };
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    startDate: monthKeys[0] ?? "",
    endDate: monthKeys[monthKeys.length - 1] ?? "",
    monthKeys,
    properties,
    rows,
    portfolioByMonth,
    administrationByMonth,
    trueNetPortfolioByMonth,
  };
}
