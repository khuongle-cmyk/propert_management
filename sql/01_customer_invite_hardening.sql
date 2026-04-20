-- =============================================================================
-- Customer invite hardening (run in Supabase SQL Editor in order)
-- =============================================================================
-- Section 1: schema (run first)
-- Section 2: diagnostic — inspect rows before backfill
-- Section 3: backfill — COMMENTED; uncomment after reviewing section 2 output
-- Section 4: optional NOT NULL on names (only if you enforce NOT NULL in DB)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Section 1 — activated_at + formal unique constraint on (company_id, lower(email))
-- -----------------------------------------------------------------------------
alter table public.customer_users
  add column if not exists activated_at timestamptz;

comment on column public.customer_users.activated_at is
  'Set when the portal user completes activation (e.g. password set on /invite).';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'customer_users_company_email_lower_key'
      and conrelid = 'public.customer_users'::regclass
  ) then
    alter table public.customer_users
      add constraint customer_users_company_email_lower_key
      unique using index customer_users_company_email_lower_uidx;
  end if;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'Unique index customer_users_company_email_lower_uidx missing; create it before adding constraint.';
end $$;

-- -----------------------------------------------------------------------------
-- Section 2 — diagnostic: invited in DB but auth shows activity (should_activate)
-- -----------------------------------------------------------------------------
select
  cu.id as customer_user_id,
  cu.company_id,
  cu.email,
  cu.status,
  cu.invited_at,
  au.id as auth_user_id,
  au.last_sign_in_at,
  au.email_confirmed_at,
  case
    when cu.status = 'invited'
      and au.id is not null
      and (au.last_sign_in_at is not null or au.email_confirmed_at is not null)
    then 'should_activate'
    else 'ok_or_review'
  end as classification
from public.customer_users cu
left join auth.users au on au.id = cu.auth_user_id
where cu.status = 'invited'
order by cu.invited_at desc;

-- Expect 0 rows with classification = 'should_activate' after section 3 runs.

-- -----------------------------------------------------------------------------
-- Section 3 — backfill (COMMENTED: uncomment after reviewing section 2)
-- -----------------------------------------------------------------------------
-- update public.customer_users cu
-- set
--   status = 'active',
--   activated_at = coalesce(au.last_sign_in_at, au.email_confirmed_at, now())
-- from auth.users au
-- where au.id = cu.auth_user_id
--   and cu.status = 'invited'
--   and (
--     au.last_sign_in_at is not null
--     or au.email_confirmed_at is not null
--   );

-- -----------------------------------------------------------------------------
-- Section 4 — optional: NOT NULL first_name / last_name (uncomment only if required)
-- -----------------------------------------------------------------------------
-- update public.customer_users
-- set
--   first_name = coalesce(nullif(trim(first_name), ''), split_part(lower(email), '@', 1)),
--   last_name = coalesce(nullif(trim(last_name), ''), '-')
-- where first_name is null
--    or trim(first_name) = ''
--    or last_name is null
--    or trim(last_name) = '';
--
-- alter table public.customer_users alter column first_name set not null;
-- alter table public.customer_users alter column last_name set not null;
