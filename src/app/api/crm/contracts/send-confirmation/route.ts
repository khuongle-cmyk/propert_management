import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { contractId } = await req.json();
    if (!contractId) return NextResponse.json({ error: "Missing contractId" }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data: contract } = await admin
      .from("contracts")
      .select("customer_email, customer_name, title")
      .eq("id", contractId)
      .single();

    if (!contract?.customer_email) {
      return NextResponse.json({ error: "No customer email" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "Email not configured" }, { status: 500 });
    }

    const customerName = contract.customer_name || "Customer";
    const contractTitle = contract.title || "Contract";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "VillageWorks <contracts@villageworks.com>",
        to: contract.customer_email,
        subject: `Contract signed: ${contractTitle}`,
        html: `
          <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px;">
            <div style="background: #21524F; padding: 24px 32px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #ffffff; margin: 0; font-size: 20px;">VillageWorks</h1>
            </div>
            <div style="background: #ffffff; padding: 32px; border: 1px solid #e5e0da; border-top: none; border-radius: 0 0 12px 12px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="width: 56px; height: 56px; border-radius: 50%; background: #eafaf1; display: inline-flex; align-items: center; justify-content: center;">
                  <span style="font-size: 28px; color: #27ae60;">✓</span>
                </div>
              </div>
              <h2 style="color: #21524F; margin: 0 0 16px; text-align: center;">Contract Signed Successfully</h2>
              <p style="color: #2c2825; font-size: 15px; line-height: 1.6;">Dear ${customerName},</p>
              <p style="color: #2c2825; font-size: 15px; line-height: 1.6;">
                Your contract <strong>"${contractTitle}"</strong> has been fully signed by all parties. Welcome to VillageWorks!
              </p>
              <p style="color: #2c2825; font-size: 15px; line-height: 1.6;">
                Our team will be in touch shortly with your onboarding details, including access cards, WiFi credentials, and building orientation information.
              </p>
              <div style="background: #f9f1e5; border-radius: 8px; padding: 16px 20px; margin: 24px 0;">
                <p style="margin: 0; font-size: 14px; color: #2c2825;">
                  <strong>What happens next:</strong><br>
                  1. You'll receive your access credentials<br>
                  2. A welcome package with building info<br>
                  3. Your workspace will be ready on the start date
                </p>
              </div>
              <p style="color: #2c2825; font-size: 15px;">Best regards,<br><strong>VillageWorks Team</strong></p>
              <hr style="border: none; border-top: 1px solid #e5e0da; margin: 24px 0;">
              <p style="color: #8a8580; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} VillageWorks Finland Oy · All rights reserved
              </p>
            </div>
          </div>
        `,
      }),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}