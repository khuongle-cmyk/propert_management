// ============================================================
// WorkspaceOS — Deposit Invoice Generator
// Location: src/lib/invoicing/generate-deposit-invoice.ts
//
// Creates a deposit invoice when a contract is signed.
// Deposit invoices are separate from rent (different ledger account).
// Only for deposit_type = 'direct_payment' (bank guarantees are manual).
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';
import { getNextInvoiceNumber } from './invoice-number';
import type { InvoiceInsert, InvoiceRowInsert } from '@/types/invoice';

const DEFAULT_VAT_RATE = 25.5;

interface DepositInvoiceResult {
  success: boolean;
  invoiceNumber?: string;
  invoiceId?: string;
  total?: number;
  error?: string;
}

export async function generateDepositInvoice(
  supabase: SupabaseClient,
  contractId: string,
  tenantId: string,
  userId?: string
): Promise<DepositInvoiceResult> {
  try {
    // 1. Fetch contract with company info
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select(`
        *,
        customer_companies:company_id ( name, vat_exempt ),
        properties:property_id ( id, name )
      `)
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return { success: false, error: `Contract not found: ${fetchError?.message}` };
    }

    // 2. Validate deposit requirements
    if (!contract.deposit_amount || contract.deposit_amount <= 0) {
      return { success: false, error: 'No deposit amount set on contract' };
    }

    if (contract.deposit_type === 'bank_guarantee') {
      return { success: false, error: 'Bank guarantee deposits are tracked manually, no invoice needed' };
    }

    if (!contract.property_id) {
      return { success: false, error: 'No property assigned to contract' };
    }

    // 3. Check if deposit invoice already exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('contract_id', contractId)
      .eq('invoice_type', 'deposit')
      .not('status', 'in', '("cancelled","credited")')
      .limit(1);

    if (existing && existing.length > 0) {
      return { success: false, error: 'Deposit invoice already exists for this contract' };
    }

    // 4. Calculate amounts
    const isVatExempt = contract.customer_companies?.vat_exempt || false;
    const vatRate = isVatExempt ? 0 : (contract.vat_rate ?? DEFAULT_VAT_RATE);
    const subtotal = contract.deposit_amount;
    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    const total = Math.round((subtotal + vatAmount) * 100) / 100;

    // 5. Get invoice number
    const currentYear = new Date().getFullYear();
    const { invoiceNumber, error: numError } = await getNextInvoiceNumber(
      supabase,
      contract.property_id,
      currentYear
    );

    if (numError) {
      return { success: false, error: `Invoice number error: ${numError}` };
    }

    // 6. Insert invoice
    const today = new Date().toISOString().split('T')[0];
    const paymentTerms = contract.payment_terms_days || 14;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    const invoiceData: InvoiceInsert = {
      tenant_id: tenantId,
      contract_id: contractId,
      property_id: contract.property_id,
      company_id: contract.company_id,
      invoice_number: invoiceNumber,
      invoice_type: 'deposit',
      invoice_date: today,
      due_date: dueDate.toISOString().split('T')[0],
      period_start: today,
      period_end: today,
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      currency: 'EUR',
      status: 'draft',
      notes: `Security deposit — ${contract.deposit_months || ''} month(s) rent`,
      created_by: userId || null,
    };

    const { data: invoice, error: insertError } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select('id')
      .single();

    if (insertError || !invoice) {
      return { success: false, error: `Insert failed: ${insertError?.message}` };
    }

    // 7. Insert invoice row
    const spaceName = contract.space_details || 'Office space';
    const propertyName = contract.properties?.name || '';
    const months = contract.deposit_months || 1;

    const rowData: InvoiceRowInsert = {
      invoice_id: invoice.id,
      description: `Security deposit — ${spaceName}${propertyName ? ` (${propertyName})` : ''}, ${months} month(s)`,
      quantity: months,
      unit: 'kk',
      unit_price: contract.monthly_price || subtotal / months,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      row_total: total,
      product_code: 'DEPOSIT',
      sort_order: 1,
    };

    await supabase.from('invoice_rows').insert(rowData);

    // 8. Update contract deposit_status to 'pending'
    await supabase
      .from('contracts')
      .update({ deposit_status: 'pending' })
      .eq('id', contractId);

    return {
      success: true,
      invoiceNumber,
      invoiceId: invoice.id,
      total,
    };
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' };
  }
}
