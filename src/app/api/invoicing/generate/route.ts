// ============================================================
// WorkspaceOS — Invoice Generation API Route
// Location: src/app/api/invoicing/generate/route.ts
//
// POST: Generate draft invoices for a target month.
// Called manually from the Invoicing UI, or later via Vercel Cron.
//
// Body (JSON):
//   targetYear:  number (required)
//   targetMonth: number 1-12 (required)
//   propertyId:  string (optional — filter to one property)
//   contractId:  string (optional — filter to one contract)
//   dryRun:      boolean (optional — preview without creating)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateInvoices } from '@/lib/invoicing/generate-invoices';

// Use service role for backend operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    // --- Auth check ---
    // Verify the caller is an authenticated admin.
    // For Vercel Cron, check the CRON_SECRET header instead.
    const cronSecret = request.headers.get('x-cron-secret');
    const authHeader = request.headers.get('authorization');

    let userId: string | null = null;
    let tenantId: string | null = null;

    if (cronSecret === process.env.CRON_SECRET) {
      // Called by Vercel Cron — use a default tenant
      // You'll set this in your environment variables
      tenantId = process.env.DEFAULT_TENANT_ID || null;
      userId = null;
    } else if (authHeader) {
      // Called by a user — validate their session
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

      if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      userId = user.id;

      // Get tenant_id from memberships
      const { data: membership } = await supabaseAdmin
        .from('memberships')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .in('role', ['super_admin', 'owner', 'manager'])
        .limit(1)
        .single();

      if (!membership) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }

      tenantId = membership.tenant_id;
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant context' }, { status: 400 });
    }

    // --- Parse body ---
    const body = await request.json();
    const { targetYear, targetMonth, propertyId, contractId, dryRun } = body;

    if (!targetYear || !targetMonth || targetMonth < 1 || targetMonth > 12) {
      return NextResponse.json(
        { error: 'targetYear and targetMonth (1-12) are required' },
        { status: 400 }
      );
    }

    // --- Generate ---
    const summary = await generateInvoices(supabaseAdmin, tenantId, {
      targetYear,
      targetMonth,
      propertyId,
      contractId,
      userId: userId || undefined,
      dryRun: dryRun || false,
    });

    return NextResponse.json({
      success: true,
      dryRun: dryRun || false,
      summary,
    });
  } catch (err: any) {
    console.error('Invoice generation API error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    );
  }
}
