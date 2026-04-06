// ============================================================
// WorkspaceOS — Invoice Types
// Location: src/types/invoice.ts
// ============================================================

export type InvoiceType = 'rent' | 'deposit' | 'credit_note' | 'one_time';
export type InvoiceStatus = 'draft' | 'approved' | 'sent' | 'paid' | 'overdue' | 'credited' | 'cancelled';
export type BillingFrequency = 'monthly' | 'quarterly' | 'annually';
export type ContractType = 'office_room' | 'virtual_office' | 'coworking' | 'meeting_room' | 'venue';
export type DepositType = 'direct_payment' | 'bank_guarantee';
export type DepositStatus = 'not_required' | 'pending' | 'received' | 'to_be_returned' | 'returned';
export type Currency = 'EUR';

// ---------- Row shapes from Supabase ----------

export interface ContractRow {
  id: string;
  tenant_id: string;
  company_id: string | null;
  property_id: string | null;
  status: string;
  contract_type: ContractType | null;

  // Financial
  monthly_price: number | null;
  furniture_monthly_price: number | null;
  vat_rate: number | null;
  currency: string | null;

  // Space
  space_details: string | null;

  // Billing
  billing_frequency: BillingFrequency | null;
  billing_day: number | null;         // day of month invoice is created
  billing_start_date: string | null;  // ISO date
  billing_end_date: string | null;
  payment_terms_days: number | null;
  billing_notes: string | null;

  // Deposit
  deposit_amount: number | null;
  deposit_months: number | null;
  deposit_type: DepositType | null;
  deposit_status: DepositStatus | null;

  // Dates
  start_date: string | null;
  end_date: string | null;

  // Relationships (via join)
  customer_companies?: { name: string; vat_exempt: boolean; vat_exempt_reason: string | null } | null;
  properties?: { name: string; id: string } | null;
}

export interface InvoiceInsert {
  tenant_id: string;
  contract_id: string;
  property_id: string | null;
  company_id: string | null;
  invoice_number: string;
  invoice_type: InvoiceType;
  invoice_date: string;       // ISO date
  due_date: string;           // ISO date
  period_start: string;
  period_end: string;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  currency: Currency;
  status: InvoiceStatus;
  notes: string | null;
  created_by: string | null;
}

export interface InvoiceRowInsert {
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  vat_rate: number;
  vat_amount: number;
  row_total: number;
  product_code: string | null;
  sort_order: number;
}

// ---------- Generation results ----------

export interface GenerationResult {
  contract_id: string;
  company_name: string;
  property_name: string;
  invoice_number: string;
  total: number;
  period: string;
  type: InvoiceType;
}

export interface GenerationSummary {
  generated: GenerationResult[];
  skipped: { contract_id: string; reason: string }[];
  errors: { contract_id: string; error: string }[];
  total_generated: number;
  total_skipped: number;
  total_errors: number;
}

// ---------- Property prefix map ----------

export const PROPERTY_PREFIXES: Record<string, string> = {
  'fcba7018': 'ERO',   // Erottaja2
  'd1fab239': 'FRE',   // Freda
  'ceefea18': 'P5',    // P5
  'bfc1848d': 'SAH',   // Sähkis
  '2983e19c': 'SKY',   // SkyLounge
};

// You'll need to update these with your actual property UUIDs from Supabase.
// The keys above are the short IDs from your context doc (procountor_connections).
// Replace them with the actual properties.id UUIDs.
