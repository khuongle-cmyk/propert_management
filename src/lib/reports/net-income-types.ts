import type { PropertyCostType } from "@/lib/property-costs/constants";

export type PropertyRevenueBreakdown = {
  office: number;
  meeting: number;
  hotDesk: number;
  venue: number;
  virtualOffice: number;
  furniture: number;
  additionalServices: number;
  total: number;
};

/** P&L-style cost buckets (historical account codes + legacy property cost types). */
export type PropertyCostBreakdown = {
  purchases: number;
  subcontracting: number;
  rent: number;
  electricity: number;
  premises_costs: number;
  staff_costs: number;
  staff_benefits: number;
  equipment_costs: number;
  travel: number;
  sales_costs: number;
  marketing: number;
  accounting_fees: number;
  admin_costs: number;
  /** 9160 and similar credits — subtracted in total via computeCostsTotal */
  financial_income: number;
  financial_costs: number;
  other: number;
  total: number;
};

export type NetIncomeMonthRow = {
  propertyId: string;
  propertyName: string;
  monthKey: string;
  revenue: PropertyRevenueBreakdown;
  costs: PropertyCostBreakdown;
  netIncome: number;
  netMarginPct: number | null;
  /** scheduled vs confirmed cost totals for transparency */
  costsScheduled: number;
  costsConfirmed: number;
};

export type NetIncomeReportModel = {
  generatedAt: string;
  startDate: string;
  endDate: string;
  monthKeys: string[];
  properties: { id: string; name: string; city: string | null }[];
  rows: NetIncomeMonthRow[];
  /** Optional portfolio roll-up by month */
  portfolioByMonth: {
    monthKey: string;
    revenue: PropertyRevenueBreakdown;
    costs: PropertyCostBreakdown;
    netIncome: number;
    netMarginPct: number | null;
  }[];
};

export type PropertyCostEntryRow = {
  id: string;
  property_id: string;
  /** Legacy UI types or synthetic bucket name; bucket resolution uses account_code when set. */
  cost_type: PropertyCostType | string;
  description: string;
  amount: number;
  cost_date: string;
  period_month: string;
  supplier_name: string | null;
  invoice_number: string | null;
  notes: string | null;
  status: "scheduled" | "confirmed" | "cancelled";
  source: "manual" | "csv" | "recurring";
  recurring_template_id: string | null;
  /** Present on historical_costs imports — drives P&L categorization. */
  account_code?: string | null;
};
