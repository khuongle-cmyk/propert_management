-- Pipeline: auto-move CRM lead on contract insert/update + deposit field on contracts
-- Run statements one at a time in Supabase SQL Editor as needed.
--
-- Schema notes (this repo):
--   - Leads live in public.customer_companies; pipeline column is "stage" (lowercase:
--     new, contacted, viewing, offer, contract, won, lost).
--   - public.contracts links to the lead via lead_id and/or company_id (same CRM id).
--   - Fully signed contracts use status signed_digital / signed_paper / active (not "signed").
--   - Client vs counter signature uses signed_at + counter_signed_at (+ requires_counter_sign).

-- ---------------------------------------------------------------------------
-- Bug 4 (partial): deposit on contracts
-- ---------------------------------------------------------------------------
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS deposit_amount text;

COMMENT ON COLUMN public.contracts.deposit_amount IS 'Free text deposit (e.g. "2 months rent", "€5,000")';

-- ---------------------------------------------------------------------------
-- Bug 1: new contract (from offer, etc.) → move lead to "contract" stage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.offer_accepted_move_to_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_uuid uuid;
BEGIN
  IF COALESCE(NEW.is_template, false) THEN
    RETURN NEW;
  END IF;

  lead_uuid := COALESCE(NEW.lead_id, NEW.company_id);
  IF lead_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.customer_companies
  SET
    stage = 'contract',
    updated_at = now(),
    stage_changed_at = now()
  WHERE id = lead_uuid
    AND stage IN ('new', 'contacted', 'viewing', 'offer');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offer_accepted_move_lead ON public.contracts;

CREATE TRIGGER offer_accepted_move_lead
  AFTER INSERT ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.offer_accepted_move_to_contract();

-- ---------------------------------------------------------------------------
-- Bug 2: contract fully signed → move lead to "won" stage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contract_signed_move_to_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_uuid uuid;
  fully_executed boolean;
BEGIN
  IF COALESCE(NEW.is_template, false) THEN
    RETURN NEW;
  END IF;

  lead_uuid := COALESCE(NEW.lead_id, NEW.company_id);
  IF lead_uuid IS NULL THEN
    RETURN NEW;
  END IF;

  fully_executed :=
    NEW.status IN ('signed_digital', 'signed_paper', 'active')
    AND NEW.signed_at IS NOT NULL
    AND (
      NEW.counter_signed_at IS NOT NULL
      OR COALESCE(NEW.requires_counter_sign, false) = false
    );

  IF TG_OP = 'UPDATE'
     AND fully_executed
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.status IN ('signed_digital', 'signed_paper', 'active')
  THEN
    UPDATE public.customer_companies
    SET
      stage = 'won',
      updated_at = now(),
      stage_changed_at = now(),
      won_at = COALESCE(won_at, now())
    WHERE id = lead_uuid
      AND stage IS DISTINCT FROM 'won';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contract_signed_move_lead ON public.contracts;

CREATE TRIGGER contract_signed_move_lead
  AFTER UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.contract_signed_move_to_won();
