import type { PropertyCostBreakdown } from "./net-income-types";

export const NET_INCOME_COST_KEYS = [
  "purchases",
  "subcontracting",
  "rent",
  "electricity",
  "premises_costs",
  "staff_costs",
  "staff_benefits",
  "equipment_costs",
  "travel",
  "sales_costs",
  "marketing",
  "accounting_fees",
  "admin_costs",
  "financial_income",
  "financial_costs",
  "other",
] as const;

export type NetIncomeCostKey = (typeof NET_INCOME_COST_KEYS)[number];

export const NET_INCOME_COST_LABELS: Record<NetIncomeCostKey, string> = {
  purchases: "Purchases (materials) 4000–4099",
  subcontracting: "Subcontracting 4450–4499",
  rent: "Rent (Toimitilavuokrat) 4500",
  electricity: "Electricity 4501",
  premises_costs: "Premises 4491–4496, 4602–4610",
  staff_costs: "Staff 5000–5990, 6130–6410",
  staff_benefits: "Staff benefits 7010–7170",
  equipment_costs: "Equipment / IT 4493+, 4600–4601, 7610–7770",
  travel: "Travel 7800",
  sales_costs: "Sales costs 8000",
  marketing: "Marketing 8050, 4496",
  accounting_fees: "Accounting 8380",
  admin_costs: "Admin 8500–8680",
  financial_income: "Financial income 9160 (offset)",
  financial_costs: "Financial costs 9440",
  other: "Other / unclassified",
};

export function emptyNetIncomeCostBreakdown(): PropertyCostBreakdown {
  return {
    purchases: 0,
    subcontracting: 0,
    rent: 0,
    electricity: 0,
    premises_costs: 0,
    staff_costs: 0,
    staff_benefits: 0,
    equipment_costs: 0,
    travel: 0,
    sales_costs: 0,
    marketing: 0,
    accounting_fees: 0,
    admin_costs: 0,
    financial_income: 0,
    financial_costs: 0,
    other: 0,
    total: 0,
  };
}

/** First 4–5 digit ledger code in the string (handles "4491, Label" etc.). */
export function parseLedgerAccountNumber(accountCode: string | null | undefined): number | null {
  const s = (accountCode ?? "").trim();
  const m = s.match(/(\d{4,5})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map Finnish P&L account code → net-income column.
 * Order: financial lines, 4000s, specific 449x/450x/460x, then 4450–4499, then staff bands, etc.
 */
export function mapAccountCodeToNetIncomeCostKey(accountCode: string | null | undefined): NetIncomeCostKey {
  const n = parseLedgerAccountNumber(accountCode);
  if (n == null) return "other";
  if (n === 9160) return "financial_income";
  if (n === 9440) return "financial_costs";
  if (n >= 4000 && n <= 4099) return "purchases";
  if (n === 4491) return "premises_costs";
  if (n === 4492) return "other";
  if (n === 4493 || n === 44933 || (n >= 44930 && n <= 44933)) return "equipment_costs";
  if (n === 4494 || n === 44941) return "premises_costs";
  if (n === 4495 || n === 44951) return "other";
  if (n === 4496) return "marketing";
  if (n >= 4450 && n <= 4499) return "subcontracting";
  if (n === 4500) return "rent";
  if (n === 4501) return "electricity";
  if (n === 4600 || n === 4601) return "equipment_costs";
  if (n === 4602 || n === 4603 || n === 4605 || n === 4610) return "premises_costs";
  if (n >= 5000 && n <= 5990) return "staff_costs";
  if (n >= 6130 && n <= 6410) return "staff_costs";
  if (n >= 7010 && n <= 7170) return "staff_benefits";
  if (n >= 7610 && n <= 7770) return "equipment_costs";
  if (n === 7800) return "travel";
  if (n === 8000) return "sales_costs";
  if (n === 8050) return "marketing";
  if (n === 8380) return "accounting_fees";
  if (n >= 8500 && n <= 8680) return "admin_costs";
  return "other";
}

/**
 * Map account code → historical_costs.cost_type / import labels (Procountor-aligned).
 */
export function mapAccountCodeToHistoricalCostType(accountCode: string | null | undefined): string {
  const n = parseLedgerAccountNumber(accountCode);
  if (n == null) return "other_one_off";
  if (n >= 4000 && n <= 4099) return "cleaning";
  if (n === 4491) return "cleaning";
  if (n === 4492) return "other_one_off";
  if (n === 4493 || n === 44933 || (n >= 44930 && n <= 44933)) return "it_infrastructure";
  if (n === 4494 || n === 44941) return "other_one_off";
  if (n === 4495 || n === 44951) return "other_one_off";
  if (n === 4496) return "marketing";
  if (n >= 4450 && n <= 4499) return "property_management";
  if (n === 4500) return "other_one_off";
  if (n === 4501) return "utilities";
  if (n === 4600 || n === 4601) return "it_infrastructure";
  if (n === 4602 || n === 4603 || n === 4605 || n === 4610) return "other_one_off";
  if (n >= 5000 && n <= 5990) return "staff";
  if (n >= 6130 && n <= 6410) return "staff";
  if (n >= 7010 && n <= 7170) return "staff";
  if (n >= 7610 && n <= 7770) return "other_one_off";
  if (n === 7800) return "other_one_off";
  if (n === 8000 || n === 8050) return "marketing";
  if (n === 8380) return "property_management";
  if (n >= 8500 && n <= 8680) return "other_one_off";
  if (n === 9160 || n === 9440) return "other_one_off";
  return "other_one_off";
}

/**
 * When account_code is missing, map stored cost_type (property UI, Procountor granular, or normalized) → net-income bucket.
 */
export function resolveCostTypeToNetIncomeKey(costType: string): NetIncomeCostKey {
  const t = costType.trim().toLowerCase().replace(/\s+/g, "_");

  switch (t) {
    case "cleaning":
      return "premises_costs";
    case "utilities":
      return "electricity";
    case "property_management":
      return "subcontracting";
    case "insurance":
    case "security":
      return "admin_costs";
    case "it_infrastructure":
      return "equipment_costs";
    case "marketing":
      return "marketing";
    case "staff":
      return "staff_costs";
    case "one_off":
    case "other_one_off":
      return "other";
    default:
      break;
  }

  const granular: Record<string, NetIncomeCostKey> = {
    purchases: "purchases",
    cleaning_supplies: "purchases",
    cleaning_equipment: "purchases",
    catering: "purchases",
    catering_billable: "purchases",
    subcontracting: "subcontracting",
    subcontracting_admin: "subcontracting",
    hired_labor: "subcontracting",
    premises_cleaning: "premises_costs",
    premises_mats: "other",
    premises_it: "equipment_costs",
    data_transfer: "equipment_costs",
    premises_maintenance: "premises_costs",
    premises_maintenance_billable: "premises_costs",
    postal: "other",
    postal_billable: "other",
    event_costs: "marketing",
    rent: "rent",
    electricity: "electricity",
    premises_costs: "premises_costs",
    printing: "equipment_costs",
    equipment_costs: "premises_costs",
    equipment_rental: "premises_costs",
    coffee_machine: "premises_costs",
    client_entertainment: "premises_costs",
    salaries: "staff_costs",
    salary_additions: "staff_costs",
    holiday_pay: "staff_costs",
    benefits_in_kind: "staff_costs",
    benefits_contra: "staff_costs",
    pension: "staff_costs",
    social_security: "staff_costs",
    accident_insurance: "staff_costs",
    unemployment_insurance: "staff_costs",
    staff_meetings: "staff_benefits",
    occupational_health: "staff_benefits",
    meal_benefits: "staff_benefits",
    staff_gifts: "staff_benefits",
    other_staff_costs: "staff_benefits",
    vehicle_costs: "equipment_costs",
    it_software: "equipment_costs",
    equipment_leasing: "equipment_costs",
    other_equipment: "equipment_costs",
    travel: "travel",
    sales_costs: "sales_costs",
    accounting: "accounting_fees",
    unallocated_invoices: "admin_costs",
    telecom: "admin_costs",
    banking_costs: "admin_costs",
    other_admin: "admin_costs",
    reconciliation: "other",
    financial_income: "financial_income",
    interest_costs: "financial_costs",
  };

  return granular[t] ?? "other";
}

/** @deprecated Use resolveCostTypeToNetIncomeKey — kept for callers. */
export function mapLegacyPropertyCostType(costType: string): NetIncomeCostKey {
  return resolveCostTypeToNetIncomeKey(costType);
}

export function costBucketForEntry(accountCode: string | null | undefined, costType: string): NetIncomeCostKey {
  const acct = (accountCode ?? "").trim();
  if (acct) return mapAccountCodeToNetIncomeCostKey(acct);
  return resolveCostTypeToNetIncomeKey(costType);
}

export function computeCostsTotal(c: PropertyCostBreakdown): number {
  const expense =
    c.purchases +
    c.subcontracting +
    c.rent +
    c.electricity +
    c.premises_costs +
    c.staff_costs +
    c.staff_benefits +
    c.equipment_costs +
    c.travel +
    c.sales_costs +
    c.marketing +
    c.accounting_fees +
    c.admin_costs +
    c.financial_costs +
    c.other;
  return expense - c.financial_income;
}
