// ============================================================
// WorkspaceOS — Vercel Cron Route for Monthly Invoice Generation
// Location: src/app/api/cron/generate-invoices/route.ts
//
// This endpoint is called by Vercel Cron on the 1st of each month.
// It generates draft invoices for all active contracts.
//
// To enable, add this to your vercel.json:
// {
//   "crons": [{
//     "path": "/api/cron/generate-invoices",
//     "schedule": "0 6 1 * *"
//   }]
// }
//
// That runs at 06:00 UTC on the 1st of every month.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron call
  const authHeader = request.headers.get('authorization');

  // Vercel Cron sends: Authorization: Bearer <CRON_SECRET>
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Determine the target month (current month)
  const now = new Date();
  const targetYear = now.getFullYear();
  const targetMonth = now.getMonth() + 1; // 1-indexed

  try {
    // Call the main generation endpoint internally
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://property-management-system-inky.vercel.app';

    const response = await fetch(`${baseUrl}/api/invoicing/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': process.env.CRON_SECRET!,
      },
      body: JSON.stringify({
        targetYear,
        targetMonth,
        dryRun: false,
      }),
    });

    const result = await response.json();

    console.log(`[Cron] Invoice generation for ${targetYear}-${targetMonth}:`, {
      generated: result.summary?.total_generated || 0,
      skipped: result.summary?.total_skipped || 0,
      errors: result.summary?.total_errors || 0,
    });

    return NextResponse.json({
      success: true,
      month: `${targetYear}-${String(targetMonth).padStart(2, '0')}`,
      ...result,
    });
  } catch (err: any) {
    console.error('[Cron] Invoice generation failed:', err);
    return NextResponse.json(
      { error: 'Cron job failed', details: err.message },
      { status: 500 }
    );
  }
}
