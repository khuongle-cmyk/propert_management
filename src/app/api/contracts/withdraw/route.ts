/**
 * POST /api/contracts/withdraw
 *
 * Reverts a fully signed contract tool row to draft (atomic via RPC).
 *
 * Fields cleared on contracts match what sign/route sets when signing:
 * - Client path: status, signed_at, signed_by_name, signature_data, signed_ip
 * - Counter path: counter_signed_by_name, counter_signed_at, counter_signature_data
 * - Plus status is set to draft (was signed_digital / signed_paper / active).
 * counter_signer_user_id is NOT set by the sign route; we do not clear it here.
 *
 * Role: super_admin, accounting, or finance (memberships; schema uses accounting, not finance-only).
 *
 * Deploy SQL first: sql/contracts_withdraw_rpc.sql
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type Body = { contract_id?: string; reason?: string };

function canWithdrawRole(role: string | null | undefined): boolean {
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  return r === "super_admin" || r === "accounting" || r === "finance";
}

export async function POST(req: Request) {
  const supabaseAuth = await createSupabaseServerClient();
  const {
    data: { user },
    error: authErr,
  } = await supabaseAuth.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contractId = String(body.contract_id ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  if (!contractId) {
    return NextResponse.json({ error: "contract_id is required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: contract, error: cErr } = await admin
    .from("contracts")
    .select("id, tenant_id, property_id, status, lead_id, company_id")
    .eq("id", contractId)
    .maybeSingle();

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (!["signed_digital", "signed_paper", "active"].includes(String(contract.status ?? ""))) {
    return NextResponse.json(
      { error: "Only signed contracts can be withdrawn (signed_digital, signed_paper, or active)." },
      { status: 400 },
    );
  }

  let tenantId = contract.tenant_id as string | null;
  if (!tenantId && contract.property_id) {
    const { data: prop } = await admin.from("properties").select("tenant_id").eq("id", contract.property_id).maybeSingle();
    tenantId = (prop?.tenant_id as string) ?? null;
  }
  if (!tenantId) {
    return NextResponse.json({ error: "Cannot resolve tenant for contract" }, { status: 400 });
  }

  const { data: memberships, error: mErr } = await admin
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId);

  if (mErr) {
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  const allowed = (memberships ?? []).some((m) => canWithdrawRole(m.role as string));
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: rpcData, error: rpcErr } = await admin.rpc("withdraw_signed_contract", {
    p_contract_id: contractId,
    p_reason: reason,
    p_actor_user_id: user.id,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? "Withdraw failed";
    if (msg.includes("function") && msg.includes("does not exist")) {
      return NextResponse.json(
        {
          error:
            "Withdraw RPC is not installed. Run sql/contracts_withdraw_rpc.sql in the Supabase SQL editor.",
        },
        { status: 503 },
      );
    }
    if (msg.toLowerCase().includes("forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (msg.includes("not found")) {
      return NextResponse.json({ error: "Contract not found" }, { status: 404 });
    }
    if (msg.includes("Only signed") || msg.includes("reason is required")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[withdraw_signed_contract]", rpcErr);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const out = rpcData as { success?: boolean; contract_id?: string } | null;
  return NextResponse.json({
    success: true,
    contract_id: out?.contract_id ?? contractId,
  });
}
