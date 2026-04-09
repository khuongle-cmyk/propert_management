/**
 * First-invoice generation on contract signing.
 *
 * Called from /api/contracts/[token]/sign/route.ts when a contract becomes
 * fully signed. Generates:
 *   1. Deposit invoice (if deposit_amount > 0) — due 7 days from signing, no VAT
 *   2. First rent invoice — covers the first billing period, pro-rated if
 *      start_date is not the 1st of the month, due on 5th of month or
 *      signing_date + payment_terms_days if later
 *
 * Idempotent: checks for existing deposit/rent invoices for the same contract
 * and period before creating. Safe to call multiple times.
 *
 * On failure, creates an internal task via createInvoiceFailureTask().
 * Never throws — errors are swallowed and logged so the sign flow continues.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getNextInvoiceNumber } from "./invoice-number";
import { createInvoiceFailureTask } from "./failure-notification";

// Default due day of the month (the "5th of the month" rule)
const DEFAULT_DUE_DAY = 5;

// Default deposit payment window in days
const DEFAULT_DEPOSIT_DUE_DAYS = 7;

// Default payment terms if contract doesn't specify
const DEFAULT_PAYMENT_TERMS_DAYS = 14;

// Default VAT rate
const DEFAULT_VAT_RATE = 25.5;

type Contract = {
  id: string;
  tenant_id: string;
  property_id: string | null;
  company_id: string | null;
  lead_id: string | null;
  title: string | null;
  monthly_price: number | null;
  furniture_monthly_price: number | null;
  furniture_included: boolean | null;
  vat_rate: number | null;
  start_date: string | null;
  payment_terms_days: number | null;
  deposit_amount: number | null;
  deposit_notes: string | null;
  promo_code: string | null;
  promo_discount: number | null;
  promo_type: string | null;
  promo_applies_to: string | null;
  promo_duration_months: number | null;
  rent_free_months: string[] | null;
  rent_free_type: string | null;
};

type GenerateResult = {
  deposit_invoice_id: string | null;
  rent_invoice_id: string | null;
  skipped: string[];
  errors: string[];
};

/**
 * Main entrypoint. Call after a contract is fully signed.
 */
export async function generateFirstInvoicesOnSign(params: {
  supabase: SupabaseClient;
  contractId: string;
}): Promise<GenerateResult> {
  const { supabase, contractId } = params;

  const result: GenerateResult = {
    deposit_invoice_id: null,
    rent_invoice_id: null,
    skipped: [],
    errors: [],
  };

  try {
    // Fetch full contract
    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .select(
        "id,tenant_id,property_id,company_id,lead_id,title,monthly_price,furniture_monthly_price,furniture_included,vat_rate,start_date,payment_terms_days,deposit_amount,deposit_notes,promo_code,promo_discount,promo_type,promo_applies_to,promo_duration_months,rent_free_months,rent_free_type",
      )
      .eq("id", contractId)
      .single();

    if (cErr || !contract) {
      const msg = `Could not load contract ${contractId}: ${cErr?.message || "not found"}`;
      result.errors.push(msg);
      await createInvoiceFailureTask({
        supabase,
        contractId,
        tenantId: null,
        propertyId: null,
        title: "Invoice generation failed: contract not found",
        details: msg,
      });
      return result;
    }

    const c = contract as Contract;

    if (!c.property_id) {
      const msg = `Contract ${contractId} has no property_id — cannot generate invoice number`;
      result.errors.push(msg);
      await createInvoiceFailureTask({
        supabase,
        contractId,
        tenantId: c.tenant_id,
        propertyId: null,
        title: "Invoice generation failed: contract missing property",
        details: msg,
      });
      return result;
    }

    if (!c.start_date) {
      const msg = `Contract ${contractId} has no start_date — cannot determine billing period`;
      result.errors.push(msg);
      await createInvoiceFailureTask({
        supabase,
        contractId,
        tenantId: c.tenant_id,
        propertyId: c.property_id,
        title: "Invoice generation failed: contract missing start date",
        details: msg,
      });
      return result;
    }

    // Resolve VAT exemption from company
    const companyId = c.company_id || c.lead_id;
    let companyVatExempt = false;
    if (companyId) {
      const { data: co } = await supabase
        .from("customer_companies")
        .select("vat_exempt")
        .eq("id", companyId)
        .maybeSingle();
      companyVatExempt = Boolean(co?.vat_exempt);
    }

    // ---- DEPOSIT INVOICE ----
    if (c.deposit_amount && c.deposit_amount > 0) {
      try {
        const depositResult = await generateDepositInvoice({
          supabase,
          contract: c,
          companyId,
        });
        if (depositResult.skipped) {
          result.skipped.push(depositResult.skipped);
        } else if (depositResult.invoiceId) {
          result.deposit_invoice_id = depositResult.invoiceId;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Deposit invoice: ${msg}`);
        await createInvoiceFailureTask({
          supabase,
          contractId: c.id,
          tenantId: c.tenant_id,
          propertyId: c.property_id,
          title: `Deposit invoice generation failed for "${c.title || "contract"}"`,
          details: msg,
        });
      }
    } else {
      result.skipped.push("deposit: deposit_amount is 0 or null");
    }

    // ---- FIRST RENT INVOICE ----
    try {
      const rentResult = await generateFirstRentInvoice({
        supabase,
        contract: c,
        companyId,
        companyVatExempt,
      });
      if (rentResult.skipped) {
        result.skipped.push(rentResult.skipped);
      } else if (rentResult.invoiceId) {
        result.rent_invoice_id = rentResult.invoiceId;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      result.errors.push(`Rent invoice: ${msg}`);
      await createInvoiceFailureTask({
        supabase,
        contractId: c.id,
        tenantId: c.tenant_id,
        propertyId: c.property_id,
        title: `First rent invoice generation failed for "${c.title || "contract"}"`,
        details: msg,
      });
    }

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    result.errors.push(`Fatal: ${msg}`);
    console.error("[generateFirstInvoicesOnSign] fatal error:", e);
    return result;
  }
}

// ============================================================================
// DEPOSIT INVOICE
// ============================================================================

async function generateDepositInvoice(params: {
  supabase: SupabaseClient;
  contract: Contract;
  companyId: string | null;
}): Promise<{ invoiceId: string | null; skipped: string | null }> {
  const { supabase, contract: c, companyId } = params;

  // Idempotency: check for existing deposit invoice for this contract
  const { data: existing } = await supabase
    .from("invoices")
    .select("id")
    .eq("contract_id", c.id)
    .eq("invoice_type", "deposit")
    .maybeSingle();

  if (existing) {
    return {
      invoiceId: null,
      skipped: `deposit: invoice already exists (${existing.id})`,
    };
  }

  const signingDate = todayLocalDate();
  const dueDate = addDays(signingDate, DEFAULT_DEPOSIT_DUE_DAYS);
  const year = signingDate.getFullYear();

  // Deposit invoices have no VAT
  const depositAmount = Number(c.deposit_amount || 0);
  const subtotal = depositAmount;
  const vatAmount = 0;
  const total = depositAmount;

  // Get next invoice number for this property
  const { data: numData, error: numErr } = await supabase.rpc(
    "get_next_invoice_number",
    { p_property_id: c.property_id, p_year: year },
  );

  if (numErr || !numData) {
    throw new Error(`Failed to get invoice number: ${numErr?.message || "no data"}`);
  }

  const { prefix, next_number } = numData as { prefix: string; next_number: number };
  const invoiceNumber = `${prefix}-${year}-${String(next_number).padStart(3, "0")}`;

  // Create invoice
  const { data: inv, error: insErr } = await supabase
    .from("invoices")
    .insert({
      tenant_id: c.tenant_id,
      contract_id: c.id,
      property_id: c.property_id,
      company_id: companyId,
      invoice_number: invoiceNumber,
      invoice_type: "deposit",
      invoice_date: formatDate(signingDate),
      due_date: formatDate(dueDate),
      period_start: null,
      period_end: null,
      subtotal,
      vat_rate: 0,
      vat_amount: vatAmount,
      total,
      currency: "EUR",
      status: "draft",
      notes: c.deposit_notes || null,
      is_reminder: false,
      reminder_level: 0,
      late_fee_amount: 0,
    })
    .select("id")
    .single();

  if (insErr || !inv) {
    throw new Error(`Failed to insert deposit invoice: ${insErr?.message}`);
  }

  // Create line item
  const description = c.deposit_notes
    ? `Security deposit — ${c.deposit_notes}`
    : "Security deposit";

  const { error: rowErr } = await supabase.from("invoice_rows").insert({
    invoice_id: inv.id,
    description,
    quantity: 1,
    unit: null,
    unit_price: depositAmount,
    vat_rate: 0,
    vat_amount: 0,
    row_total: depositAmount,
    sort_order: 0,
  });

  if (rowErr) {
    // Roll back the invoice so we don't leave orphans
    await supabase.from("invoices").delete().eq("id", inv.id);
    throw new Error(`Failed to insert deposit invoice row: ${rowErr.message}`);
  }

  return { invoiceId: inv.id, skipped: null };
}

// ============================================================================
// FIRST RENT INVOICE
// ============================================================================

async function generateFirstRentInvoice(params: {
  supabase: SupabaseClient;
  contract: Contract;
  companyId: string | null;
  companyVatExempt: boolean;
}): Promise<{ invoiceId: string | null; skipped: string | null }> {
  const { supabase, contract: c, companyId, companyVatExempt } = params;

  const startDate = parseDate(c.start_date!);

  // --- Step A: Determine first billing period ---
  const periodStart = new Date(startDate);
  const periodEnd = lastDayOfMonth(startDate);

  // --- Step B: Pro-ration factor ---
  const isPartial = startDate.getDate() !== 1;
  const daysInMonth = daysInMonthOf(startDate);
  const daysCharged = isPartial
    ? daysInMonth - startDate.getDate() + 1
    : daysInMonth;
  const prorationFactor = isPartial ? daysCharged / daysInMonth : 1;

  // --- Step D: Idempotency check (manual invoice may already exist for this period) ---
  // Find any rent invoice for this contract where the period overlaps first_period
  const periodStartStr = formatDate(periodStart);
  const periodEndStr = formatDate(periodEnd);

  const { data: existingRent } = await supabase
    .from("invoices")
    .select("id,period_start,period_end")
    .eq("contract_id", c.id)
    .eq("invoice_type", "rent")
    .not("period_start", "is", null);

  if (existingRent && existingRent.length > 0) {
    // Check if any existing invoice's period overlaps our target period
    for (const existing of existingRent) {
      if (
        existing.period_start &&
        existing.period_end &&
        datesOverlap(
          existing.period_start,
          existing.period_end,
          periodStartStr,
          periodEndStr,
        )
      ) {
        return {
          invoiceId: null,
          skipped: `rent: invoice already exists for period ${periodStartStr}..${periodEndStr} (${existing.id})`,
        };
      }
    }
  }

  // --- Step C: Determine due date ---
  const signingDate = todayLocalDate();
  const paymentTermsDays = c.payment_terms_days || DEFAULT_PAYMENT_TERMS_DAYS;
  const earliestAllowed = addDays(signingDate, paymentTermsDays);

  // Candidate: 5th of first period's month
  const candidate = new Date(
    periodStart.getFullYear(),
    periodStart.getMonth(),
    DEFAULT_DUE_DAY,
  );

  let dueDate: Date;
  if (candidate >= earliestAllowed && candidate >= startDate) {
    dueDate = candidate;
  } else {
    // One-off first due date: later of (earliest_allowed, start_date)
    dueDate = earliestAllowed >= startDate ? earliestAllowed : startDate;
  }

  // Invoice date = due date - payment terms, but never before today
  let invoiceDate = addDays(dueDate, -paymentTermsDays);
  if (invoiceDate < signingDate) {
    invoiceDate = signingDate;
  }

  // --- Step E: Rent-free check ---
  const periodKey = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, "0")}`;
  const isRentFree = Array.isArray(c.rent_free_months) && c.rent_free_months.includes(periodKey);
  const rentFreeType = c.rent_free_type || "full";

  let rentLine = (Number(c.monthly_price) || 0) * prorationFactor;
  let furnitureLine = c.furniture_included
    ? (Number(c.furniture_monthly_price) || 0) * prorationFactor
    : 0;

  let rentFreeNote: string | null = null;
  if (isRentFree) {
    if (rentFreeType === "full") {
      rentLine = 0;
      furnitureLine = 0;
      rentFreeNote = `Rent-free month (full) — ${periodKey}`;
    } else if (rentFreeType === "rent_only") {
      rentLine = 0;
      // furniture stays charged
      rentFreeNote = `Rent-free month (rent waived, furniture charged) — ${periodKey}`;
    }
  }

  // --- Step F: Promo discount ---
  // Applies to first invoice only in Step 2 scope.
  // The promo_duration_months column is set up for the monthly generator to use later.
  let promoNote: string | null = null;
  if (c.promo_discount && c.promo_discount > 0 && !isRentFree) {
    const appliesTo = (c.promo_applies_to || "all").toLowerCase();
    const promoType = (c.promo_type || "percent").toLowerCase();
    const discount = Number(c.promo_discount);

    if (promoType === "percent" || promoType === "percentage") {
      const multiplier = 1 - discount / 100;
      if (appliesTo === "rent" || appliesTo === "all") {
        rentLine = rentLine * multiplier;
      }
      if (appliesTo === "furniture" || appliesTo === "all") {
        furnitureLine = furnitureLine * multiplier;
      }
      promoNote = `Promo: ${discount}% off ${appliesTo} (${c.promo_code || "no code"})`;
    } else if (promoType === "fixed" || promoType === "fixed_amount") {
      if (appliesTo === "rent" || appliesTo === "all") {
        rentLine = Math.max(0, rentLine - discount);
      } else if (appliesTo === "furniture") {
        furnitureLine = Math.max(0, furnitureLine - discount);
      }
      promoNote = `Promo: €${discount} off ${appliesTo} (${c.promo_code || "no code"})`;
    }
  }

  // Round to 2 decimals
  rentLine = round2(rentLine);
  furnitureLine = round2(furnitureLine);

  // --- Step G: VAT + totals ---
  const vatRate = companyVatExempt ? 0 : Number(c.vat_rate) || DEFAULT_VAT_RATE;
  const subtotal = round2(rentLine + furnitureLine);
  const vatAmount = round2((subtotal * vatRate) / 100);
  const total = round2(subtotal + vatAmount);

  // --- Get next invoice number ---
  const year = invoiceDate.getFullYear();
  const { data: numData, error: numErr } = await supabase.rpc(
    "get_next_invoice_number",
    { p_property_id: c.property_id, p_year: year },
  );

  if (numErr || !numData) {
    throw new Error(`Failed to get invoice number: ${numErr?.message || "no data"}`);
  }

  const { prefix, next_number } = numData as { prefix: string; next_number: number };
  const invoiceNumber = `${prefix}-${year}-${String(next_number).padStart(3, "0")}`;

  // --- Compose notes ---
  const notes = [
    isPartial ? `First month pro-rated: ${daysCharged}/${daysInMonth} days` : null,
    rentFreeNote,
    promoNote,
  ]
    .filter(Boolean)
    .join(" | ");

  // --- Insert invoice ---
  const { data: inv, error: insErr } = await supabase
    .from("invoices")
    .insert({
      tenant_id: c.tenant_id,
      contract_id: c.id,
      property_id: c.property_id,
      company_id: companyId,
      invoice_number: invoiceNumber,
      invoice_type: "rent",
      invoice_date: formatDate(invoiceDate),
      due_date: formatDate(dueDate),
      period_start: periodStartStr,
      period_end: periodEndStr,
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      currency: "EUR",
      status: "draft",
      notes: notes || null,
      is_reminder: false,
      reminder_level: 0,
      late_fee_amount: 0,
    })
    .select("id")
    .single();

  if (insErr || !inv) {
    throw new Error(`Failed to insert rent invoice: ${insErr?.message}`);
  }

  // --- Insert line items ---
  const rows: Array<Record<string, unknown>> = [];
  let sortOrder = 0;

  // Rent line (always present, even if 0 for rent-free months)
  const rentDescription = isPartial
    ? `Rent ${periodStartStr} – ${periodEndStr} (${daysCharged}/${daysInMonth} days)`
    : `Rent ${periodStartStr} – ${periodEndStr}`;

  rows.push({
    invoice_id: inv.id,
    description: rentDescription,
    quantity: 1,
    unit: null,
    unit_price: rentLine,
    vat_rate: vatRate,
    vat_amount: round2((rentLine * vatRate) / 100),
    row_total: round2(rentLine + (rentLine * vatRate) / 100),
    sort_order: sortOrder++,
  });

  // Furniture line (only if furniture_included)
  if (c.furniture_included && (furnitureLine > 0 || isRentFree)) {
    const furnitureDescription = isPartial
      ? `Furniture ${periodStartStr} – ${periodEndStr} (${daysCharged}/${daysInMonth} days)`
      : `Furniture ${periodStartStr} – ${periodEndStr}`;

    rows.push({
      invoice_id: inv.id,
      description: furnitureDescription,
      quantity: 1,
      unit: null,
      unit_price: furnitureLine,
      vat_rate: vatRate,
      vat_amount: round2((furnitureLine * vatRate) / 100),
      row_total: round2(furnitureLine + (furnitureLine * vatRate) / 100),
      sort_order: sortOrder++,
    });
  }

  const { error: rowErr } = await supabase.from("invoice_rows").insert(rows);
  if (rowErr) {
    // Roll back the invoice
    await supabase.from("invoices").delete().eq("id", inv.id);
    throw new Error(`Failed to insert rent invoice rows: ${rowErr.message}`);
  }

  return { invoiceId: inv.id, skipped: null };
}

// ============================================================================
// DATE HELPERS (timezone-safe, local dates only)
// ============================================================================

/** Today as a local-midnight Date object. */
function todayLocalDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Parse YYYY-MM-DD as a local-midnight Date. */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format Date as YYYY-MM-DD using local components (no UTC shift). */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Add days to a date, returning a new local-midnight Date. */
function addDays(d: Date, days: number): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

/** Last day of the month containing the given date. */
function lastDayOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** Number of days in the month containing the given date. */
function daysInMonthOf(d: Date): number {
  return lastDayOfMonth(d).getDate();
}

/** True if period A overlaps period B (inclusive on both ends). */
function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Round to 2 decimal places. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}