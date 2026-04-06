// ============================================================
// WorkspaceOS — Invoice Number Generator
// Location: src/lib/invoicing/invoice-number.ts
//
// Generates sequential invoice numbers per property per year.
// Format: PREFIX-YYYY-NNN  (e.g., ERO-2025-001)
// Uses the invoice_number_sequences table with row-level locking.
// ============================================================

import { SupabaseClient } from '@supabase/supabase-js';

interface NextNumberResult {
  invoiceNumber: string;
  error: string | null;
}

/**
 * Get the next invoice number for a property.
 * Uses a Supabase RPC function for atomic increment to avoid race conditions.
 *
 * IMPORTANT: You must create the RPC function in Supabase first (SQL below).
 */
export async function getNextInvoiceNumber(
  supabase: SupabaseClient,
  propertyId: string,
  currentYear: number = new Date().getFullYear()
): Promise<NextNumberResult> {
  try {
    // Call the atomic RPC function
    const { data, error } = await supabase.rpc('get_next_invoice_number', {
      p_property_id: propertyId,
      p_year: currentYear,
    });

    if (error) {
      console.error('Invoice number RPC error:', error);
      return { invoiceNumber: '', error: error.message };
    }

    // data returns: { prefix: 'ERO', next_number: 1 }
    const prefix = data.prefix;
    const nextNum = String(data.next_number).padStart(3, '0');
    const invoiceNumber = `${prefix}-${currentYear}-${nextNum}`;

    return { invoiceNumber, error: null };
  } catch (err: any) {
    console.error('Invoice number generation failed:', err);
    return { invoiceNumber: '', error: err.message || 'Unknown error' };
  }
}
