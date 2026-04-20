-- Atomic withdraw of a signed contract tool row back to draft.
-- Run in Supabase SQL Editor (or migrate) before using POST /api/contracts/withdraw.
--
-- Sign route (src/app/api/contracts/[token]/sign/route.ts) sets these columns on public.contracts:
--   Client path: status, signed_at, signed_by_name, signature_data, signed_ip
--   Counter path: counter_signed_by_name, counter_signed_at, counter_signature_data
--   When fully executed: status = 'signed_digital' (also signed_paper/active allowed by schema)
-- This RPC clears those signature-related fields and sets status = 'draft'.
--
-- Pipeline: customer_companies.stage = 'contract' (see pipeline_triggers_contract_stage_deposit.sql).
-- There is no pipeline_stage column on legacy public.leads in this repo; CRM uses customer_companies.stage.

CREATE OR REPLACE FUNCTION public.withdraw_signed_contract(
  p_contract_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contract record;
  v_tenant uuid;
  v_ok boolean;
  v_lead_target uuid;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason is required';
  END IF;

  SELECT *
  INTO v_contract
  FROM public.contracts
  WHERE id = p_contract_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract not found';
  END IF;

  IF v_contract.status IS NULL
     OR v_contract.status NOT IN ('signed_digital', 'signed_paper', 'active') THEN
    RAISE EXCEPTION 'Only signed contracts can be withdrawn';
  END IF;

  v_tenant := v_contract.tenant_id;
  IF v_tenant IS NULL AND v_contract.property_id IS NOT NULL THEN
    SELECT p.tenant_id INTO v_tenant
    FROM public.properties p
    WHERE p.id = v_contract.property_id;
  END IF;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Cannot resolve tenant for contract';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.user_id = p_actor_user_id
      AND m.tenant_id = v_tenant
      AND lower(trim(m.role::text)) IN ('super_admin', 'accounting', 'finance')
  )
  INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Optional table: skip if not deployed
  BEGIN
    DELETE FROM public.invoice_reminder_queue
    WHERE original_invoice_id IN (
      SELECT id FROM public.invoices WHERE contract_id = p_contract_id
    );
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  DELETE FROM public.invoice_rows
  WHERE invoice_id IN (
    SELECT id FROM public.invoices WHERE contract_id = p_contract_id
  );

  DELETE FROM public.invoices
  WHERE contract_id = p_contract_id;

  DELETE FROM public.client_tasks
  WHERE contract_id = p_contract_id;

  -- Signing-related columns only. Do NOT clear tenant_id, property_id, company_id, lead_id,
  -- customer_email, customer_name, public_token, counter_signer_user_id, or any other business fields.
  UPDATE public.contracts
  SET
    status = 'draft',
    signed_at = NULL,
    signed_by_name = NULL,
    signature_data = NULL,
    signed_ip = NULL,
    counter_signed_by_name = NULL,
    counter_signed_at = NULL,
    counter_signature_data = NULL,
    updated_at = now()
  WHERE id = p_contract_id;

  v_lead_target := coalesce(v_contract.lead_id, v_contract.company_id);
  IF v_lead_target IS NOT NULL THEN
    UPDATE public.customer_companies
    SET
      stage = 'contract',
      won_at = NULL,
      updated_at = now(),
      stage_changed_at = now()
    WHERE id = v_lead_target;
  END IF;

  IF v_contract.lead_id IS NOT NULL THEN
    INSERT INTO public.lead_activities (
      lead_id,
      activity_type,
      actor_user_id,
      summary,
      details,
      metadata
    )
    VALUES (
      v_contract.lead_id,
      'note_added',
      p_actor_user_id,
      'Signed contract withdrawn to draft',
      p_reason,
      jsonb_build_object(
        'action', 'contract_withdrawn',
        'reason', p_reason,
        'contract_id', p_contract_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'contract_id', p_contract_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_signed_contract(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.withdraw_signed_contract(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.withdraw_signed_contract IS
  'Atomically withdraws a signed contract to draft, deletes related invoices/tasks, reverts CRM stage.';
