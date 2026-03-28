-- Budget planning & forecasting (run after tenants, properties, auth.users exist).
-- RLS: read for finance/report roles; write via can_manage_tenant_data(tenant_id).

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,
  name text not null,
  budget_year integer not null check (budget_year between 2000 and 2100),
  budget_type text not null default 'annual' check (budget_type in ('annual', 'reforecast')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'active', 'archived')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  notes text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  opening_cash_balance numeric(16,2) not null default 0,
  parent_budget_id uuid references public.budgets(id) on delete set null,
  version_label text
);

create index if not exists budgets_tenant_year_idx on public.budgets(tenant_id, budget_year desc);
create index if not exists budgets_parent_idx on public.budgets(parent_budget_id);

create table if not exists public.budget_revenue_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  category text not null check (
    category in (
      'office_rent',
      'meeting_room',
      'hot_desk',
      'venue',
      'virtual_office',
      'furniture',
      'additional_services'
    )
  ),
  budgeted_amount numeric(16,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists budget_revenue_lines_unique_idx
  on public.budget_revenue_lines (
    budget_id,
    year,
    month,
    category,
    (coalesce(property_id::text, ''))
  );

create index if not exists budget_revenue_lines_budget_idx on public.budget_revenue_lines(budget_id);

create table if not exists public.budget_cost_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  cost_type text not null check (
    cost_type in (
      'cleaning',
      'utilities',
      'property_management',
      'insurance',
      'security',
      'it_infrastructure',
      'marketing',
      'staff',
      'capex',
      'other'
    )
  ),
  budgeted_amount numeric(16,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists budget_cost_lines_unique_idx
  on public.budget_cost_lines (
    budget_id,
    year,
    month,
    cost_type,
    (coalesce(property_id::text, ''))
  );

create index if not exists budget_cost_lines_budget_idx on public.budget_cost_lines(budget_id);

create table if not exists public.budget_headcount_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  role_name text not null,
  headcount integer not null default 0 check (headcount >= 0),
  monthly_cost numeric(16,2) not null default 0 check (monthly_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists budget_headcount_lines_unique_idx
  on public.budget_headcount_lines (
    budget_id,
    year,
    month,
    lower(trim(role_name)),
    (coalesce(property_id::text, ''))
  );

create index if not exists budget_headcount_lines_budget_idx on public.budget_headcount_lines(budget_id);

create table if not exists public.budget_capex_lines (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  item_name text not null,
  category text not null check (category in ('renovation', 'equipment', 'furniture', 'it', 'other')),
  planned_date date,
  estimated_cost numeric(16,2) not null default 0 check (estimated_cost >= 0),
  actual_cost numeric(16,2) not null default 0 check (actual_cost >= 0),
  status text not null default 'planned' check (status in ('planned', 'approved', 'in_progress', 'completed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_capex_lines_budget_idx on public.budget_capex_lines(budget_id);

create table if not exists public.budget_occupancy_targets (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references public.budgets(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  month smallint not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  space_type text not null check (space_type in ('office', 'hot_desk', 'meeting_room', 'venue')),
  target_occupancy_pct numeric(6,2),
  target_units_occupied integer,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists budget_occupancy_targets_unique_idx
  on public.budget_occupancy_targets (
    budget_id,
    year,
    month,
    space_type,
    (coalesce(property_id::text, ''))
  );

create index if not exists budget_occupancy_targets_budget_idx on public.budget_occupancy_targets(budget_id);

alter table public.budgets enable row level security;
alter table public.budget_revenue_lines enable row level security;
alter table public.budget_cost_lines enable row level security;
alter table public.budget_headcount_lines enable row level security;
alter table public.budget_capex_lines enable row level security;
alter table public.budget_occupancy_targets enable row level security;

-- Select: same breadth as historical_revenue
drop policy if exists budgets_select on public.budgets;
create policy budgets_select on public.budgets
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = budgets.tenant_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budgets_write on public.budgets;
create policy budgets_write on public.budgets
for all using (public.can_manage_tenant_data(budgets.tenant_id))
with check (public.can_manage_tenant_data(budgets.tenant_id));

drop policy if exists super_admin_full_access on public.budgets;
create policy super_admin_full_access on public.budgets
for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Child tables: access via parent budget tenant
drop policy if exists budget_revenue_lines_select on public.budget_revenue_lines;
create policy budget_revenue_lines_select on public.budget_revenue_lines
for select using (
  exists (
    select 1 from public.budgets b
    join public.memberships m on m.tenant_id = b.tenant_id and m.user_id = auth.uid()
    where b.id = budget_revenue_lines.budget_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budget_revenue_lines_write on public.budget_revenue_lines;
create policy budget_revenue_lines_write on public.budget_revenue_lines
for all using (
  exists (
    select 1 from public.budgets b
    where b.id = budget_revenue_lines.budget_id
      and public.can_manage_tenant_data(b.tenant_id)
  )
)
with check (
  exists (
    select 1 from public.budgets b
    where b.id = budget_revenue_lines.budget_id
      and public.can_manage_tenant_data(b.tenant_id)
  )
);

drop policy if exists super_admin_full_access on public.budget_revenue_lines;
create policy super_admin_full_access on public.budget_revenue_lines
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists budget_cost_lines_select on public.budget_cost_lines;
create policy budget_cost_lines_select on public.budget_cost_lines
for select using (
  exists (
    select 1 from public.budgets b
    join public.memberships m on m.tenant_id = b.tenant_id and m.user_id = auth.uid()
    where b.id = budget_cost_lines.budget_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budget_cost_lines_write on public.budget_cost_lines;
create policy budget_cost_lines_write on public.budget_cost_lines
for all using (
  exists (select 1 from public.budgets b where b.id = budget_cost_lines.budget_id and public.can_manage_tenant_data(b.tenant_id))
)
with check (
  exists (select 1 from public.budgets b where b.id = budget_cost_lines.budget_id and public.can_manage_tenant_data(b.tenant_id))
);

drop policy if exists super_admin_full_access on public.budget_cost_lines;
create policy super_admin_full_access on public.budget_cost_lines
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists budget_headcount_lines_select on public.budget_headcount_lines;
create policy budget_headcount_lines_select on public.budget_headcount_lines
for select using (
  exists (
    select 1 from public.budgets b
    join public.memberships m on m.tenant_id = b.tenant_id and m.user_id = auth.uid()
    where b.id = budget_headcount_lines.budget_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budget_headcount_lines_write on public.budget_headcount_lines;
create policy budget_headcount_lines_write on public.budget_headcount_lines
for all using (
  exists (select 1 from public.budgets b where b.id = budget_headcount_lines.budget_id and public.can_manage_tenant_data(b.tenant_id))
)
with check (
  exists (select 1 from public.budgets b where b.id = budget_headcount_lines.budget_id and public.can_manage_tenant_data(b.tenant_id))
);

drop policy if exists super_admin_full_access on public.budget_headcount_lines;
create policy super_admin_full_access on public.budget_headcount_lines
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists budget_capex_lines_select on public.budget_capex_lines;
create policy budget_capex_lines_select on public.budget_capex_lines
for select using (
  exists (
    select 1 from public.budgets b
    join public.memberships m on m.tenant_id = b.tenant_id and m.user_id = auth.uid()
    where b.id = budget_capex_lines.budget_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budget_capex_lines_write on public.budget_capex_lines;
create policy budget_capex_lines_write on public.budget_capex_lines
for all using (
  exists (select 1 from public.budgets b where b.id = budget_capex_lines.budget_id and public.can_manage_tenant_data(b.tenant_id))
)
with check (
  exists (select 1 from public.budgets b where b.id = budget_capex_lines.budget_id and public.can_manage_tenant_data(b.tenant_id))
);

drop policy if exists super_admin_full_access on public.budget_capex_lines;
create policy super_admin_full_access on public.budget_capex_lines
for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists budget_occupancy_targets_select on public.budget_occupancy_targets;
create policy budget_occupancy_targets_select on public.budget_occupancy_targets
for select using (
  exists (
    select 1 from public.budgets b
    join public.memberships m on m.tenant_id = b.tenant_id and m.user_id = auth.uid()
    where b.id = budget_occupancy_targets.budget_id
      and lower(coalesce(m.role, '')) in (
        'owner', 'manager', 'customer_service', 'accounting', 'viewer', 'super_admin'
      )
  )
);

drop policy if exists budget_occupancy_targets_write on public.budget_occupancy_targets;
create policy budget_occupancy_targets_write on public.budget_occupancy_targets
for all using (
  exists (select 1 from public.budgets b where b.id = budget_occupancy_targets.budget_id and public.can_manage_tenant_data(b.tenant_id))
)
with check (
  exists (select 1 from public.budgets b where b.id = budget_occupancy_targets.budget_id and public.can_manage_tenant_data(b.tenant_id))
);

drop policy if exists super_admin_full_access on public.budget_occupancy_targets;
create policy super_admin_full_access on public.budget_occupancy_targets
for all using (public.is_super_admin()) with check (public.is_super_admin());

comment on table public.budgets is 'Annual / reforecast budgets; property_id null = portfolio-level template.';
comment on table public.budget_revenue_lines is 'Monthly budget amounts by revenue category.';
comment on table public.budget_cost_lines is 'Monthly budget amounts by operating cost category.';
comment on table public.budget_headcount_lines is 'Planned FTE and loaded cost per role per month.';
comment on table public.budget_capex_lines is 'Capital project lines; cash flow uses planned_date month.';
comment on table public.budget_occupancy_targets is 'Target occupancy % / units by space type per month.';
