-- Migration: Tighten memberships SELECT RLS
-- 
-- Background: The "Membership read all" policy with USING (true) was leaking
-- every user's membership rows to every authenticated user. This caused
-- isSuperAdmin and other role flags to evaluate true for all users. Fixed at
-- the application layer in src/lib/nav/get-app-nav-initial.ts and other files
-- via .eq("user_id", user.id), but the database-level leak must also be closed.
--
-- ROLLOUT INSTRUCTIONS:
-- This file contains TWO phases. Run them separately.
--
-- 1. Run PHASE 1 first. It is non-destructive — it only adds a new policy.
-- 2. After PHASE 1, manually verify cross-user reads work:
--    - Sign in as test.staff
--    - Open a contract editor — counter-signer dropdown should show all 4 staff
--    - Open the task creation modal — assignee dropdown should show all 4 staff
--    - Open CRM pipeline filter — agent filter should show all 4 staff
-- 3. If all three work, run PHASE 2. If any fail, run ROLLBACK PHASE 1 instead.
-- 4. After PHASE 2, re-verify the same dropdowns still work AND verify
--    test.staff still shows isSuperAdmin: false in the SSR appNavInitial.

-- =============================================================================
-- PHASE 1: Add the new tenant-scoped policy (non-destructive)
-- =============================================================================
-- Use a SECURITY DEFINER helper function to avoid potential RLS recursion when
-- the policy self-references the memberships table.

BEGIN;

create or replace function public.current_user_tenant_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from public.memberships where user_id = auth.uid()
$$;

-- Lock down execute permissions: only authenticated users need this
revoke all on function public.current_user_tenant_ids() from public;
grant execute on function public.current_user_tenant_ids() to authenticated;

create policy "Membership read same tenant"
on public.memberships
for select
to authenticated
using (
  tenant_id in (select public.current_user_tenant_ids())
);

COMMIT;

-- =============================================================================
-- PHASE 2: Drop the leak and the duplicate (destructive — run only after PHASE 1 verified)
-- =============================================================================

BEGIN;

drop policy if exists "Membership read all" on public.memberships;
drop policy if exists "users_can_read_own_memberships" on public.memberships;

COMMIT;

-- =============================================================================
-- ROLLBACK PHASE 1 (run if PHASE 1 verification fails before PHASE 2)
-- =============================================================================
/*
BEGIN;
drop policy if exists "Membership read same tenant" on public.memberships;
drop function if exists public.current_user_tenant_ids();
COMMIT;
*/

-- =============================================================================
-- ROLLBACK PHASE 2 (run if a regression is found AFTER PHASE 2)
-- =============================================================================
/*
BEGIN;
-- Restore the broad read so the system returns to its prior (leaky but
-- working) state. The application-layer .eq("user_id", ...) fixes will keep
-- the nav flag bug from re-appearing, but cross-user reads will work again.
create policy "Membership read all"
on public.memberships
for select
to authenticated
using (true);
COMMIT;
*/
