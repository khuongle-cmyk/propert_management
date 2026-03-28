-- Budget layers: property vs administration; saved portfolio combinations.
-- historical_costs: optional org-level administration rows (property_id NULL).
-- Run after budget_planning.sql and historical_data_import.sql.

-- ---- budgets.budget_scope ----
alter table public.budgets
  add column if not exists budget_scope text not null default 'property';

update public.budgets
set budget_scope = case
  when property_id is null then 'administration'
  else 'property'
end
where budget_scope = 'property';

alter table public.budgets
  drop constraint if exists budgets_budget_scope_check;

alter table public.budgets
  add constraint budgets_budget_scope_check check (
    budget_scope in ('property', 'administration', 'combined')
  );

alter table public.budgets
  drop constraint if exists budgets_scope_property_consistency;

alter table public.budgets
  add constraint budgets_scope_property_consistency check (
    (budget_scope = 'property' and property_id is not null)
    or (budget_scope in ('administration', 'combined') and property_id is null)
  );

create unique index if not exists budgets_one_admin_per_tenant_year_idx
  on public.budgets (tenant_id, budget_year)
  where budget_scope = 'administration';

create unique index if not exists budgets_one_property_per_tenant_year_idx
  on public.budgets (tenant_id, budget_year, property_id)
  where budget_scope = 'property';

-- ---- budget_combinations ----
create table if not exists public.budget_combinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  property_ids uuid[] not null default '{}',
  include_admin boolean not null default true,
  is_default boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists budget_combinations_tenant_idx on public.budget_combinations(tenant_id);

create unique index if not exists budget_combinations_tenant_name_lower_idx
  on public.budget_combinations (tenant_id, lower(trim(name)));

alter table public.budget_combinations enable row level security;

drop policy if exists budget_combinations_select on public.budget_combinations;
create policy budget_combinations_select on public.budget_combinations
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = budget_combinations.tenant_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budget_combinations_write on public.budget_combinations;
create policy budget_combinations_write on public.budget_combinations
for all using (public.can_manage_tenant_data(budget_combinations.tenant_id))
with check (public.can_manage_tenant_data(budget_combinations.tenant_id));

drop policy if exists super_admin_full_access on public.budget_combinations;
create policy super_admin_full_access on public.budget_combinations
for all using (public.is_super_admin()) with check (public.is_super_admin());

comment on column public.budgets.budget_scope is 'property = single asset; administration = org central (property_id null); combined reserved.';
comment on table public.budget_combinations is 'Saved portfolio views: which property budgets + optional admin to aggregate.';
