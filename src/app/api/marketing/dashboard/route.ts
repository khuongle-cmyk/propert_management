import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMarketingAccess, parseTenantIdParam } from "@/lib/marketing/access";

function monthStartUtc(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function monthEndUtc(d = new Date()): string {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return next.toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { tenantIds, isSuperAdmin, error: aErr } = await getMarketingAccess(supabase, user.id);
  if (aErr) return NextResponse.json({ error: aErr }, { status: 500 });
  if (!isSuperAdmin && tenantIds.length === 0) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  let tenantId = parseTenantIdParam(url, tenantIds);
  if (isSuperAdmin) {
    const q = (url.searchParams.get("tenantId") ?? "").trim();
    if (!q) {
      return NextResponse.json({ error: "tenantId query required for super admin" }, { status: 400 });
    }
    tenantId = q;
  } else if (!tenantId) {
    return NextResponse.json({ error: "tenantId required when multiple organizations" }, { status: 400 });
  }

  const start = monthStartUtc();
  const end = monthEndUtc();
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;

  const { data: props } = await supabase.from("properties").select("id").eq("tenant_id", tenantId!);
  const propertyIds = ((props ?? []) as { id: string }[]).map((p) => p.id);

  let visitorsMonth = 0;
  let leadsAggMonth = 0;
  let bookingsAggMonth = 0;
  let adSpendMonth = 0;
  let revenueAttrMonth = 0;

  const { data: maRows } = await supabase
    .from("marketing_analytics")
    .select("website_visitors,new_leads,bookings_made,ad_spend,revenue_attributed")
    .eq("tenant_id", tenantId!)
    .gte("date", start)
    .lte("date", end);

  for (const r of maRows ?? []) {
    visitorsMonth += Number((r as { website_visitors: number }).website_visitors) || 0;
    leadsAggMonth += Number((r as { new_leads: number }).new_leads) || 0;
    bookingsAggMonth += Number((r as { bookings_made: number }).bookings_made) || 0;
    adSpendMonth += Number((r as { ad_spend: number }).ad_spend) || 0;
    revenueAttrMonth += Number((r as { revenue_attributed: number }).revenue_attributed) || 0;
  }

  let newLeadsFromCrm = 0;
  const { count: leadCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId!)
    .gte("created_at", `${start}T00:00:00.000Z`)
    .lte("created_at", `${end}T23:59:59.999Z`);
  newLeadsFromCrm = leadCount ?? 0;

  const newLeads = Math.max(newLeadsFromCrm, leadsAggMonth);

  let newTenantsMonth = 0;
  const { count: wonCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId!)
    .eq("stage", "won")
    .not("won_at", "is", null)
    .gte("won_at", `${start}T00:00:00.000Z`)
    .lte("won_at", `${end}T23:59:59.999Z`);
  newTenantsMonth = wonCount ?? 0;

  let sumConvertDays = 0;
  let convertN = 0;
  const { data: wonLeads } = await supabase
    .from("leads")
    .select("created_at, won_at")
    .eq("tenant_id", tenantId!)
    .eq("stage", "won")
    .not("won_at", "is", null)
    .gte("won_at", `${start}T00:00:00.000Z`)
    .lte("won_at", `${end}T23:59:59.999Z`)
    .limit(500);
  for (const row of wonLeads ?? []) {
    const w = row as { created_at: string; won_at: string };
    const c = new Date(w.created_at).getTime();
    const x = new Date(w.won_at).getTime();
    if (Number.isFinite(c) && Number.isFinite(x) && x >= c) {
      sumConvertDays += (x - c) / 86400000;
      convertN += 1;
    }
  }
  const avgConvertDays = convertN > 0 ? Math.round((sumConvertDays / convertN) * 10) / 10 : null;

  const visitorsForRate = visitorsMonth > 0 ? visitorsMonth : 0;
  const leadConversionPct =
    visitorsForRate > 0 && newLeads > 0 ? Math.round((newLeads / visitorsForRate) * 10000) / 100 : null;
  const costPerLead =
    adSpendMonth > 0 && newLeads > 0 ? Math.round((adSpendMonth / newLeads) * 100) / 100 : null;

  const leadToTenantPct =
    newLeads > 0 && newTenantsMonth > 0 ? Math.round((newTenantsMonth / newLeads) * 10000) / 100 : null;

  let activeCampaigns = 0;
  const { count: ac } = await supabase
    .from("marketing_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId!)
    .in("status", ["active", "scheduled"]);
  activeCampaigns = ac ?? 0;

  let emailsSentMonth = 0;
  let openSum = 0;
  let openDenom = 0;
  const { data: emailRows } = await supabase
    .from("marketing_emails")
    .select("recipient_count, open_count, status, sent_at")
    .eq("tenant_id", tenantId!)
    .eq("status", "sent")
    .gte("sent_at", `${start}T00:00:00.000Z`)
    .lte("sent_at", `${end}T23:59:59.999Z`);
  for (const e of emailRows ?? []) {
    const row = e as { recipient_count: number; open_count: number };
    emailsSentMonth += Number(row.recipient_count) || 0;
    const rc = Number(row.recipient_count) || 0;
    const oc = Number(row.open_count) || 0;
    if (rc > 0) {
      openSum += oc / rc;
      openDenom += 1;
    }
  }
  const avgOpenRatePct = openDenom > 0 ? Math.round((openSum / openDenom) * 10000) / 100 : null;

  let smsDelivered = 0;
  let smsAttempted = 0;
  const { data: smsRows } = await supabase
    .from("marketing_sms")
    .select("delivered_count, recipient_count, status, sent_at")
    .eq("tenant_id", tenantId!)
    .eq("status", "sent")
    .gte("sent_at", `${start}T00:00:00.000Z`)
    .lte("sent_at", `${end}T23:59:59.999Z`);
  for (const s of smsRows ?? []) {
    const row = s as { delivered_count: number; recipient_count: number };
    smsDelivered += Number(row.delivered_count) || 0;
    smsAttempted += Number(row.recipient_count) || 0;
  }
  const smsDeliveryPct =
    smsAttempted > 0 ? Math.round((smsDelivered / smsAttempted) * 10000) / 100 : null;

  const { data: funnelRows } = await supabase
    .from("marketing_analytics")
    .select("date, website_visitors, new_leads, bookings_made")
    .eq("tenant_id", tenantId!)
    .gte("date", `${y}-${String(m).padStart(2, "0")}-01`)
    .order("date", { ascending: true })
    .limit(62);

  const funnel = (funnelRows ?? []).map((r) => {
    const x = r as { date: string; website_visitors: number; new_leads: number; bookings_made: number };
    return {
      date: x.date,
      visitors: x.website_visitors,
      leads: x.new_leads,
      bookings: x.bookings_made,
    };
  });

  const { data: channelRows } = await supabase
    .from("marketing_analytics")
    .select("source, revenue_attributed")
    .eq("tenant_id", tenantId!)
    .gte("date", start)
    .lte("date", end);
  const revenueByChannel: Record<string, number> = {};
  for (const r of channelRows ?? []) {
    const x = r as { source: string; revenue_attributed: number };
    revenueByChannel[x.source] = (revenueByChannel[x.source] ?? 0) + (Number(x.revenue_attributed) || 0);
  }

  const { data: campPerf } = await supabase
    .from("marketing_campaigns")
    .select("id, name, status, actual_spend, campaign_type")
    .eq("tenant_id", tenantId!)
    .order("updated_at", { ascending: false })
    .limit(12);

  let revenueTrend: { monthKey: string; revenue: number }[] = [];
  if (propertyIds.length > 0) {
    const { data: hr } = await supabase
      .from("historical_revenue")
      .select("year, month, total_revenue")
      .in("property_id", propertyIds)
      .gte("year", y - 1)
      .limit(4000);
    const byMonth = new Map<string, number>();
    for (const row of hr ?? []) {
      const r = row as { year: number; month: number; total_revenue: unknown };
      const mk = `${r.year}-${String(r.month).padStart(2, "0")}`;
      const add = Number(r.total_revenue) || 0;
      byMonth.set(mk, (byMonth.get(mk) ?? 0) + add);
    }
    revenueTrend = [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([monthKey, revenue]) => ({ monthKey, revenue }));
  }

  const { data: eventMarks } = await supabase
    .from("marketing_events")
    .select("start_datetime, name")
    .eq("tenant_id", tenantId!)
    .eq("status", "published")
    .gte("start_datetime", `${y - 1}-01-01`)
    .order("start_datetime", { ascending: true })
    .limit(24);

  return NextResponse.json({
    tenantId,
    monthRange: { start, end },
    kpis: {
      acquisition: {
        websiteVisitors: visitorsMonth,
        newLeads,
        leadConversionPct,
        costPerLead,
      },
      conversion: {
        leadToTenantPct,
        newTenantsMonth,
        avgConvertDays,
        revenueAttributed: revenueAttrMonth,
      },
      campaigns: {
        activeCampaigns,
        emailsSentMonth,
        avgOpenRatePct,
        smsDeliveryPct,
      },
    },
    charts: {
      funnel,
      revenueByChannel,
      campaignPerformance: campPerf ?? [],
      revenueTrend,
      events: eventMarks ?? [],
    },
  });
}
