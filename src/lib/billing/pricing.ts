import type { SupabaseClient } from "@supabase/supabase-js";

export type PricingPlan = {
  id: "starter" | "professional" | "enterprise";
  display_name: string;
  monthly_base_fee: number;
  included_properties: number;
  per_property_fee: number;
  included_users: number;
  per_user_fee: number;
  trial_days: number;
  is_active: boolean;
};

export type PricingBreakdown = {
  planId: string;
  planName: string;
  billingMonth: string;
  activeProperties: number;
  activeUsers: number;
  lineItems: Array<{ key: string; label: string; qty: number; unitPrice: number; amount: number }>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  trialCreditAmount: number;
  inTrial: boolean;
};

export function monthStartIso(date = new Date()): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computePricingBreakdown(params: {
  plan: PricingPlan;
  activeProperties: number;
  activeUsers: number;
  billingMonth: string;
  vatRate?: number;
  inTrial?: boolean;
}): PricingBreakdown {
  const vatRate = params.vatRate ?? 0.255;
  const propOver = Math.max(0, params.activeProperties - params.plan.included_properties);
  const userOver = Math.max(0, params.activeUsers - params.plan.included_users);
  const lineItems = [
    { key: "base", label: `${params.plan.display_name} base fee`, qty: 1, unitPrice: params.plan.monthly_base_fee, amount: params.plan.monthly_base_fee },
    { key: "prop", label: "Property overage", qty: propOver, unitPrice: params.plan.per_property_fee, amount: propOver * params.plan.per_property_fee },
    { key: "user", label: "User overage", qty: userOver, unitPrice: params.plan.per_user_fee, amount: userOver * params.plan.per_user_fee },
  ].map((x) => ({ ...x, amount: round2(x.amount) }));
  const rawSubtotal = lineItems.reduce((s, l) => s + l.amount, 0);
  const trialCreditAmount = params.inTrial ? rawSubtotal : 0;
  const subtotal = round2(rawSubtotal - trialCreditAmount);
  const taxAmount = round2(subtotal * vatRate);
  const totalAmount = round2(subtotal + taxAmount);
  return {
    planId: params.plan.id,
    planName: params.plan.display_name,
    billingMonth: params.billingMonth,
    activeProperties: params.activeProperties,
    activeUsers: params.activeUsers,
    lineItems,
    subtotal,
    taxAmount,
    totalAmount,
    trialCreditAmount: round2(trialCreditAmount),
    inTrial: !!params.inTrial,
  };
}

export async function loadPlan(supabase: SupabaseClient, planId: string): Promise<PricingPlan | null> {
  const { data } = await supabase.from("pricing_plans").select("*").eq("id", planId).maybeSingle();
  if (!data) return null;
  return data as PricingPlan;
}

export async function countTenantUsage(supabase: SupabaseClient, tenantId: string): Promise<{ properties: number; users: number }> {
  const [{ count: propCount }, { count: userCount }] = await Promise.all([
    supabase.from("properties").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("tenant_id", tenantId),
  ]);
  return { properties: propCount ?? 0, users: userCount ?? 0 };
}

