-- =============================================================================
-- 02_customer_users_status_fix.sql
-- Applied: 2026-04-20 (production Supabase)
-- =============================================================================
-- Purpose:
--   Fix a latent bug where the CRM lead-conversion flow
--   (src/lib/crm/lead-company-payload.ts) was hardcoding
--   `status = 'invited'` on newly created customer_users rows — even though
--   no auth user was created and no invite email was sent. Result: phantom
--   rows polluting the table and confusing invite-status queries.
--
-- This migration:
--   1. Expands the status CHECK constraint to allow 'prospect'
--   2. Backfills the 11 existing phantom rows from 'invited' -> 'prospect'
--   3. Adds a new invariant: status='invited' REQUIRES auth_user_id IS NOT NULL
--
-- Companion code change:
--   src/lib/crm/lead-company-payload.ts line 64: "invited" -> "prospect"
--
-- This file is committed for historical record. DO NOT re-run against a
-- database where it has already been applied — the ALTER CONSTRAINT ADD
-- for ck_customer_users_invited_requires_auth would fail on the second run.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Step 1: Preview what we're about to migrate. Eyeball this output before
--         committing. Expected: 11 rows, all status='invited', all
--         auth_user_id IS NULL.
-- -----------------------------------------------------------------------------
SELECT
  'BEFORE MIGRATION' AS phase,
  status,
  COUNT(*) AS row_count,
  COUNT(*) FILTER (WHERE auth_user_id IS NULL) AS without_auth,
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) AS with_auth
FROM public.customer_users
GROUP BY status
ORDER BY status;

-- -----------------------------------------------------------------------------
-- Step 2: Expand the allowed status values. Drop-and-recreate is the only way
--         with named CHECK constraints in Postgres.
-- -----------------------------------------------------------------------------
ALTER TABLE public.customer_users
  DROP CONSTRAINT IF EXISTS customer_users_status_check;

ALTER TABLE public.customer_users
  ADD CONSTRAINT customer_users_status_check
  CHECK (status = ANY (ARRAY[
    'prospect'::text,   -- NEW: CRM-created placeholder contact, no auth, no invite sent
    'invited'::text,    -- invite email sent, awaiting activation (requires auth_user_id)
    'active'::text,     -- activated, can log in
    'inactive'::text    -- deactivated
  ]));

-- -----------------------------------------------------------------------------
-- Step 3: Backfill phantom rows.
--         Any row with status='invited' AND auth_user_id IS NULL is, by
--         definition, not really an invite — it's a CRM-created placeholder.
--         Move them to 'prospect'. Must happen BEFORE adding the invariant
--         in Step 4, or Step 4 will refuse to apply.
-- -----------------------------------------------------------------------------
WITH migrated AS (
  UPDATE public.customer_users
  SET status = 'prospect'
  WHERE status = 'invited'
    AND auth_user_id IS NULL
  RETURNING id, email, company_id
)
SELECT
  'BACKFILLED' AS phase,
  COUNT(*) AS rows_updated
FROM migrated;

-- -----------------------------------------------------------------------------
-- Step 4: Add the invariant. This is the real protection: any future code
--         path (CRM, invite route, data import, anything) that tries to
--         insert status='invited' without an auth_user_id will be rejected
--         by Postgres at the DB level.
-- -----------------------------------------------------------------------------
ALTER TABLE public.customer_users
  ADD CONSTRAINT ck_customer_users_invited_requires_auth
  CHECK (
    status <> 'invited' OR auth_user_id IS NOT NULL
  );

-- -----------------------------------------------------------------------------
-- Step 5: Final verification. Expected output:
--         active   | 1 row  | with_auth=1
--         prospect | 11 rows | without_auth=11
-- -----------------------------------------------------------------------------
SELECT
  'AFTER MIGRATION' AS phase,
  status,
  COUNT(*) AS row_count,
  COUNT(*) FILTER (WHERE auth_user_id IS NULL) AS without_auth,
  COUNT(*) FILTER (WHERE auth_user_id IS NOT NULL) AS with_auth
FROM public.customer_users
GROUP BY status
ORDER BY status;

-- -----------------------------------------------------------------------------
-- REVIEW THE OUTPUT ABOVE. If it looks correct:
--   COMMIT;
-- If anything looks wrong:
--   ROLLBACK;
-- -----------------------------------------------------------------------------
