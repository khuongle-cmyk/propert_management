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
//   tenantId:    string (required for browser session — must match a membership row)
//   propertyId:  string (optional — filter to one property)
//   contractId:  string (optional — filter to one contract)
//   dryRun:      boolean (optional — preview without creating)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { generateInvoices } from '@/lib/invoicing/generate-invoices';

// Use service role for backend operations (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const INVOICING_ROLES = new Set(['super_admin', 'owner', 'manager', 'accounting']);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { targetYear, targetMonth, propertyId, contractId, dryRun, tenantId: bodyTenantId } = body;

    // --- Auth: cookie session (browser) or CRON_SECRET (server-to-server / cron only) ---
    let userId: string | null = null;
    let tenantId: string | null = null;

    const supabaseAuth = await createSupabaseServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabaseAuth.auth.getUser();

    if (user && !userErr) {
      const tid = typeof bodyTenantId === 'string' ? bodyTenantId.trim() : '';
      if (!tid) {
        return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
      }

      const { data: membership, error: memErr } = await supabaseAdmin
        .from('memberships')
        .select('tenant_id, role')
        .eq('user_id', user.id)
        .eq('tenant_id', tid)
        .maybeSingle();

      if (memErr) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      const role = String(membership?.role ?? '').trim().toLowerCase();
      if (!membership || !INVOICING_ROLES.has(role)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      tenantId = tid;
      userId = user.id;
    } else {
      const cronSecret = request.headers.get('x-cron-secret');
      const authHeader = request.headers.get('authorization');
      const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const secret = process.env.CRON_SECRET;
      const okCron =
        !!secret &&
        ((cronSecret && cronSecret === secret) || (bearer && bearer === secret));

      if (!okCron) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      tenantId = process.env.DEFAULT_TENANT_ID || null;
      userId = null;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant context' }, { status: 400 });
    }

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
