import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildContractFullySignedConfirmationHtml } from "@/lib/email/contract-fully-signed-html";

/** CRM/internal: send “fully signed” confirmation to customer (after counter-sign completes dual flow, etc.). */
export async function POST(req: Request) {
  try {
    const { contractId } = await req.json();
    if (!contractId) return NextResponse.json({ error: "Missing contractId" }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data: row, error } = await admin
      .from("contracts")
      .select(
        "customer_email, customer_name, title, signed_at, counter_signed_at, requires_counter_sign, status, lead_id, company_id, tenant_id, property_id, start_date",
      )
      .eq("id", contractId)
      .single();

    if (error || !row) return NextResponse.json({ error: "Contract not found" }, { status: 404 });

    const fullySigned =
      row.status === "signed_digital" ||
      (Boolean(row.signed_at) && (!row.requires_counter_sign || Boolean(row.counter_signed_at)));

    if (!fullySigned) {
      return NextResponse.json({ error: "Contract is not fully signed yet" }, { status: 400 });
    }

    const email = row.customer_email;
    if (!email) {
      return NextResponse.json({ error: "No customer email on file" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "Email service not configured" }, { status: 500 });
    }

    const customerName = row.customer_name || "Customer";
    const contractTitle = row.title || "Contract";
    const html = buildContractFullySignedConfirmationHtml(customerName, contractTitle);

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "VillageWorks <contracts@villageworks.com>",
        to: email,
        subject: `Contract signed: ${contractTitle}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err?.message === "string" ? err.message : "Failed to send email");
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
