-- -----------------------------------------------------------------------------
-- Marketing offers: auto-expire by valid_until + optional pg_cron
-- Run in Supabase SQL Editor (one statement at a time if you prefer).
-- -----------------------------------------------------------------------------

-- Statement 1 — Auto-expire on write
CREATE OR REPLACE FUNCTION auto_expire_marketing_offers()
RETURNS trigger AS $$
BEGIN
  IF NEW.valid_until IS NOT NULL
     AND NEW.valid_until < CURRENT_DATE
     AND NEW.status NOT IN ('expired', 'archived') THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Statement 2 — Trigger (PostgreSQL 14+: EXECUTE FUNCTION; older: EXECUTE PROCEDURE)
DROP TRIGGER IF EXISTS trg_auto_expire_marketing_offers ON public.marketing_offers;
CREATE TRIGGER trg_auto_expire_marketing_offers
  BEFORE INSERT OR UPDATE ON public.marketing_offers
  FOR EACH ROW
  EXECUTE FUNCTION auto_expire_marketing_offers();

-- If the above fails with “syntax error”, use instead:
-- EXECUTE PROCEDURE auto_expire_marketing_offers();

-- Statement 3 — Backfill expired rows
UPDATE public.marketing_offers
SET status = 'expired'
WHERE valid_until IS NOT NULL
  AND valid_until < CURRENT_DATE
  AND status NOT IN ('expired', 'archived');

-- Statement 4 — Extend status + editor-only bundle/referral fields (for PATCH / UI)
ALTER TABLE public.marketing_offers
  ADD COLUMN IF NOT EXISTS bundle_description text,
  ADD COLUMN IF NOT EXISTS referral_bonus_amount numeric(14, 2);

ALTER TABLE public.marketing_offers DROP CONSTRAINT IF EXISTS marketing_offers_status_check;
ALTER TABLE public.marketing_offers ADD CONSTRAINT marketing_offers_status_check
  CHECK (status IN ('draft', 'active', 'expired', 'paused', 'archived'));

-- Statement 5 — Daily cron (requires pg_cron extension; skip if unavailable)
-- SELECT cron.schedule(
--   'expire-marketing-offers-daily',
--   '0 1 * * *',
--   $$UPDATE public.marketing_offers SET status = 'expired' WHERE valid_until IS NOT NULL AND valid_until < CURRENT_DATE AND status NOT IN ('expired', 'archived')$$
-- );
