// ============================================================
// WorkspaceOS — Deposit Invoice API Route
// Location: src/app/api/invoicing/deposit/route.ts
//
// POST: Generate a deposit invoice for a specific contract.
// Called when a contract is signed or manually from UI.
//
// Body (JSON):
//   contractId: string (required)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateDepositInvoice } from '@/lib/invoicing/generate-deposit-invoice';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // --- Auth check ---
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant from membership
    const { data: membership } = await supabaseAdmin
      .from('memberships')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .in('role', ['super_admin', 'owner', 'manager', 'accounting'])
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // --- Parse body ---
    const { contractId } = await request.json();

    if (!contractId) {
      return NextResponse.json({ error: 'contractId is required' }, { status: 400 });
    }

    // --- Generate deposit invoice ---
    const result = await generateDepositInvoice(
      supabaseAdmin,
      contractId,
      membership.tenant_id,
      user.id
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      invoiceNumber: result.invoiceNumber,
      invoiceId: result.invoiceId,
      total: result.total,
    });
  } catch (err: any) {
    console.error('Deposit invoice API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
