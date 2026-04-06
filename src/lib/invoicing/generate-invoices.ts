// ============================================================
// WorkspaceOS — Invoice Generation Engine
// Location: src/lib/invoicing/generate-invoices.ts
//
// Core logic: reads active contracts, determines which ones need
// invoicing for a target month, and creates draft invoices.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { getNextInvoiceNumber } from './invoice-number';
import type {
  ContractRow,
  InvoiceInsert,
  InvoiceRowInsert,
  InvoiceType,
  GenerationResult,
  GenerationSummary,
} from '@/types/invoice';

// Default VAT rate in Finland
const DEFAULT_VAT_RATE = 25.5;

// ---------- Helpers ----------

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const end = new Date(year, month, 0);
  return {
    start: `${year}-${String(month).padStart(2, '0')}-01`,
    end: formatLocalDate(end),
  };
}

function getQuarterRange(year: number, month: number): { start: string; end: string } {
  const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
  const start = new Date(year, quarterStart - 1, 1);
  const end = new Date(year, quarterStart + 2, 0);
  return {
    start: formatLocalDate(start),
    end: formatLocalDate(end),
  };
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return formatLocalDate(date);
}

function calculateAmounts(subtotal: number, vatRate: number, isVatExempt: boolean) {
  const effectiveVat = isVatExempt ? 0 : vatRate;
  const vatAmount = Math.round(subtotal * (effectiveVat / 100) * 100) / 100;
  const total = Math.round((subtotal + vatAmount) * 100) / 100;
  return { subtotal, vatRate: effectiveVat, vatAmount, total };
}

function getPeriodAmount(monthlyPrice: number, furniturePrice: number, frequency: string): number {
  const totalMonthly = monthlyPrice + furniturePrice;
  switch (frequency) {
    case 'quarterly': return totalMonthly * 3;
    case 'annually': return totalMonthly * 12;
    default: return totalMonthly;
  }
}

function shouldInvoiceForMonth(contract: ContractRow, targetYear: number, targetMonth: number): boolean {
  const frequency = contract.billing_frequency || 'monthly';
  if (frequency === 'monthly') return true;
  if (frequency === 'quarterly') return [1, 4, 7, 10].includes(targetMonth);
  if (frequency === 'annually') return targetMonth === 1;
  return true;
}

function buildDescription(contract: ContractRow, periodStart: string, periodEnd: string): string {
  const spaceName = contract.space_details || 'Office space';
  const propertyName = contract.properties?.name || '';
  const startFormatted = new Date(periodStart).toLocaleDateString('fi-FI');
  const endFormatted = new Date(periodEnd).toLocaleDateString('fi-FI');
  return `${spaceName}${propertyName ? ` — ${propertyName}` : ''}, ${startFormatted} – ${endFormatted}`;
}

// ---------- Main generation function ----------

export interface GenerateInvoicesOptions {
  targetYear: number;
  targetMonth: number;
  propertyId?: string;
  contractId?: string;
  userId?: string;
  dryRun?: boolean;
}

export async function generateInvoices(
  supabase: SupabaseClient,
  tenantId: string,
  options: GenerateInvoicesOptions
): Promise<GenerationSummary> {
  const { targetYear, targetMonth, propertyId, contractId, userId, dryRun = false } = options;

  const summary: GenerationSummary = {
    generated: [],
    skipped: [],
    errors: [],
    total_generated: 0,
    total_skipped: 0,
    total_errors: 0,
  };

  // ---- 1. Fetch active contracts ----
  let query = supabase
    .from('contracts')
    .select(`
      *,
      customer_companies:company_id ( name, vat_exempt, vat_exempt_reason ),
      properties:property_id ( id, name )
    `)
    .eq('tenant_id', tenantId)
    .in('status', ['active', 'signed', 'signed_digital', 'signed_paper']);

  if (propertyId) query = query.eq('property_id', propertyId);
  if (contractId) query = query.eq('id', contractId);

  const { data: contracts, error: fetchError } = await query;

  if (fetchError) {
    console.error('Failed to fetch contracts:', fetchError);
    summary.errors.push({ contract_id: 'ALL', error: fetchError.message });
    summary.total_errors = 1;
    return summary;
  }

  if (!contracts || contracts.length === 0) {
    return summary;
  }

  // ---- 2. Process each contract ----
  for (const contract of contracts as ContractRow[]) {
    try {
      // --- Validation ---

      if (!contract.monthly_price || contract.monthly_price <= 0) {
        summary.skipped.push({ contract_id: contract.id, reason: 'No monthly price set' });
        continue;
      }

      if (!contract.property_id) {
        summary.skipped.push({ contract_id: contract.id, reason: 'No property assigned' });
        continue;
      }

      const { start: monthStart, end: monthEnd } = getMonthRange(targetYear, targetMonth);

      if (contract.start_date && contract.start_date > monthEnd) {
        summary.skipped.push({ contract_id: contract.id, reason: `Contract starts after target month (${contract.start_date})` });
        continue;
      }

      if (contract.end_date && contract.end_date < monthStart) {
        summary.skipped.push({ contract_id: contract.id, reason: `Contract ended before target month (${contract.end_date})` });
        continue;
      }

      if (!shouldInvoiceForMonth(contract, targetYear, targetMonth)) {
        summary.skipped.push({ contract_id: contract.id, reason: `Not a billing month for ${contract.billing_frequency} frequency` });
        continue;
      }

      // Duplicate check
      const { data: existingInvoices } = await supabase
        .from('invoices')
        .select('id')
        .eq('contract_id', contract.id)
        .eq('period_start', monthStart)
        .eq('invoice_type', 'rent')
        .not('status', 'in', '("cancelled","credited")')
        .limit(1);

      if (existingInvoices && existingInvoices.length > 0) {
        summary.skipped.push({ contract_id: contract.id, reason: `Invoice already exists for period ${monthStart}` });
        continue;
      }

      // --- Calculate period and amounts ---

      const frequency = contract.billing_frequency || 'monthly';
      let periodStart: string;
      let periodEnd: string;

      if (frequency === 'quarterly') {
        const q = getQuarterRange(targetYear, targetMonth);
        periodStart = q.start;
        periodEnd = q.end;
      } else if (frequency === 'annually') {
        periodStart = `${targetYear}-01-01`;
        periodEnd = `${targetYear}-12-31`;
      } else {
        const m = getMonthRange(targetYear, targetMonth);
        periodStart = m.start;
        periodEnd = m.end;
      }

      const isVatExempt = contract.customer_companies?.vat_exempt || false;
      const vatRate = contract.vat_rate ?? DEFAULT_VAT_RATE;
      const furniturePrice = contract.furniture_monthly_price || 0;
      const periodAmount = getPeriodAmount(contract.monthly_price, furniturePrice, frequency);
      const amounts = calculateAmounts(periodAmount, vatRate, isVatExempt);

      const billingDay = Math.min(contract.billing_day || 1, 28);
      const invoiceDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(billingDay).padStart(2, '0')}`;
      const paymentTerms = contract.payment_terms_days || 14;
      const dueDate = addDays(invoiceDate, paymentTerms);

      // --- Dry run ---
      if (dryRun) {
        summary.generated.push({
          contract_id: contract.id,
          company_name: contract.customer_companies?.name || 'Unknown',
          property_name: contract.properties?.name || 'Unknown',
          invoice_number: `PREVIEW-${contract.id.slice(0, 8)}`,
          total: amounts.total,
          period: `${periodStart} → ${periodEnd}`,
          type: 'rent',
        });
        continue;
      }

      // --- Get invoice number ---
      const { invoiceNumber, error: numError } = await getNextInvoiceNumber(supabase, contract.property_id, targetYear);

      if (numError) {
        summary.errors.push({ contract_id: contract.id, error: `Invoice number error: ${numError}` });
        continue;
      }

      // --- Insert invoice ---
      const invoiceData: InvoiceInsert = {
        tenant_id: tenantId,
        contract_id: contract.id,
        property_id: contract.property_id,
        company_id: contract.company_id,
        invoice_number: invoiceNumber,
        invoice_type: 'rent',
        invoice_date: invoiceDate,
        due_date: dueDate,
        period_start: periodStart,
        period_end: periodEnd,
        subtotal: amounts.subtotal,
        vat_rate: amounts.vatRate,
        vat_amount: amounts.vatAmount,
        total: amounts.total,
        currency: 'EUR',
        status: 'draft',
        notes: contract.billing_notes || null,
        created_by: userId || null,
      };

      const { data: invoice, error: insertError } = await supabase
        .from('invoices')
        .insert(invoiceData)
        .select('id')
        .single();

      if (insertError || !invoice) {
        summary.errors.push({ contract_id: contract.id, error: `Insert failed: ${insertError?.message || 'No data returned'}` });
        continue;
      }

      // --- Insert invoice rows ---
      const rows: InvoiceRowInsert[] = [];
      const periodMonths = frequency === 'quarterly' ? 3 : frequency === 'annually' ? 12 : 1;

      // Row 1: Office rent
      const rentSubtotal = contract.monthly_price * periodMonths;
      const rentVat = isVatExempt ? 0 : Math.round(rentSubtotal * (vatRate / 100) * 100) / 100;

      rows.push({
        invoice_id: invoice.id,
        description: buildDescription(contract, periodStart, periodEnd),
        quantity: periodMonths,
        unit: 'kk',
        unit_price: contract.monthly_price,
        vat_rate: amounts.vatRate,
        vat_amount: rentVat,
        row_total: Math.round((rentSubtotal + rentVat) * 100) / 100,
        product_code: null,
        sort_order: 1,
      });

      // Row 2: Furniture (if applicable)
      if (furniturePrice > 0) {
        const furnitureSubtotal = furniturePrice * periodMonths;
        const furnitureVat = isVatExempt ? 0 : Math.round(furnitureSubtotal * (vatRate / 100) * 100) / 100;

        rows.push({
          invoice_id: invoice.id,
          description: `Furniture rental, ${new Date(periodStart).toLocaleDateString('fi-FI')} – ${new Date(periodEnd).toLocaleDateString('fi-FI')}`,
          quantity: periodMonths,
          unit: 'kk',
          unit_price: furniturePrice,
          vat_rate: amounts.vatRate,
          vat_amount: furnitureVat,
          row_total: Math.round((furnitureSubtotal + furnitureVat) * 100) / 100,
          product_code: 'FURNITURE',
          sort_order: 2,
        });
      }

      const { error: rowError } = await supabase.from('invoice_rows').insert(rows);
      if (rowError) {
        console.error(`Invoice row insert failed for invoice ${invoice.id}:`, rowError);
      }

      // --- Record success ---
      summary.generated.push({
        contract_id: contract.id,
        company_name: contract.customer_companies?.name || 'Unknown',
        property_name: contract.properties?.name || 'Unknown',
        invoice_number: invoiceNumber,
        total: amounts.total,
        period: `${periodStart} → ${periodEnd}`,
        type: 'rent',
      });
    } catch (err: any) {
      summary.errors.push({ contract_id: contract.id, error: err.message || 'Unknown error' });
    }
  }

  summary.total_generated = summary.generated.length;
  summary.total_skipped = summary.skipped.length;
  summary.total_errors = summary.errors.length;

  return summary;
}
