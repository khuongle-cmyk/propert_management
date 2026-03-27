-- Historical reporting data import tables (2y+ baseline)
-- Run after core schema and CRM/reports migrations.

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  import_type text not null check (import_type in ('revenue', 'costs', 'invoices', 'occupancy')),
  source_software text,
  file_name text,
  rows_imported integer not null default 0,
  rows_failed integer not null default 0,
  imported_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.historical_revenue (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  office_rent_revenue numeric(14,2) not null default 0,
  meeting_room_revenue numeric(14,2) not null default 0,
  hot_desk_revenue numeric(14,2) not null default 0,
  venue_revenue numeric(14,2) not null default 0,
  additional_services_revenue numeric(14,2) not null default 0,
  total_revenue numeric(14,2) not null default 0,
  data_source text not null check (data_source in ('manual', 'excel', 'accounting_software')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(property_id, year, month)
);

create table if not exists public.historical_costs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cost_date date not null,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  cost_type text not null,
  description text,
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat >= 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  supplier_name text,
  invoice_number text,
  data_source text not null check (data_source in ('manual', 'excel', 'accounting_software')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.historical_invoices (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_number text not null,
  invoice_date date not null,
  due_date date not null,
  client_tenant text,
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat >= 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  status text not null check (status in ('paid', 'unpaid', 'overdue')),
  payment_date date,
  data_source text not null check (data_source in ('manual', 'excel', 'accounting_software')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(property_id, invoice_number)
);

create table if not exists public.historical_occupancy (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  total_rooms integer not null check (total_rooms >= 0),
  occupied_rooms integer not null check (occupied_rooms >= 0),
  occupancy_pct numeric(6,2) not null default 0,
  revenue_per_m2 numeric(14,2),
  data_source text not null check (data_source in ('manual', 'excel', 'accounting_software')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(property_id, year, month)
);

create index if not exists historical_revenue_prop_month_idx on public.historical_revenue(property_id, year, month);
create index if not exists historical_costs_prop_month_idx on public.historical_costs(property_id, year, month, cost_date);
create index if not exists historical_costs_invoice_idx on public.historical_costs(invoice_number);
create index if not exists historical_invoices_prop_date_idx on public.historical_invoices(property_id, invoice_date, due_date);
create index if not exists historical_invoices_status_idx on public.historical_invoices(status);
create index if not exists historical_occupancy_prop_month_idx on public.historical_occupancy(property_id, year, month);
create index if not exists import_batches_tenant_created_idx on public.import_batches(tenant_id, created_at desc);

create table if not exists public.procountor_property_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mapping_key text not null,
  property_id uuid not null references public.properties(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(tenant_id, mapping_key)
);

create index if not exists procountor_property_mappings_tenant_idx on public.procountor_property_mappings(tenant_id, mapping_key);

create table if not exists public.procountor_cost_center_mappings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cost_center_code text not null,
  cost_center_name text,
  property_id uuid not null references public.properties(id) on delete cascade,
  data_type text not null check (data_type in ('revenue', 'cost')),
  category text not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, cost_center_code)
);

create index if not exists procountor_cc_map_tenant_idx on public.procountor_cost_center_mappings(tenant_id, cost_center_code);

alter table public.import_batches enable row level security;
alter table public.historical_revenue enable row level security;
alter table public.historical_costs enable row level security;
alter table public.historical_invoices enable row level security;
alter table public.historical_occupancy enable row level security;
alter table public.procountor_property_mappings enable row level security;
alter table public.procountor_cost_center_mappings enable row level security;

create or replace function public.can_manage_tenant_data(tid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = tid
      and lower(coalesce(m.role,'')) in ('owner','manager','super_admin')
  );
$$;

drop policy if exists import_batches_select on public.import_batches;
create policy import_batches_select on public.import_batches
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = import_batches.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists import_batches_insert on public.import_batches;
create policy import_batches_insert on public.import_batches
for insert with check (public.can_manage_tenant_data(import_batches.tenant_id));

drop policy if exists historical_revenue_select on public.historical_revenue;
create policy historical_revenue_select on public.historical_revenue
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = historical_revenue.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists historical_revenue_write on public.historical_revenue;
create policy historical_revenue_write on public.historical_revenue
for all using (public.can_manage_tenant_data(historical_revenue.tenant_id))
with check (public.can_manage_tenant_data(historical_revenue.tenant_id));

drop policy if exists historical_costs_select on public.historical_costs;
create policy historical_costs_select on public.historical_costs
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = historical_costs.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists historical_costs_write on public.historical_costs;
create policy historical_costs_write on public.historical_costs
for all using (public.can_manage_tenant_data(historical_costs.tenant_id))
with check (public.can_manage_tenant_data(historical_costs.tenant_id));

drop policy if exists historical_invoices_select on public.historical_invoices;
create policy historical_invoices_select on public.historical_invoices
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = historical_invoices.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists historical_invoices_write on public.historical_invoices;
create policy historical_invoices_write on public.historical_invoices
for all using (public.can_manage_tenant_data(historical_invoices.tenant_id))
with check (public.can_manage_tenant_data(historical_invoices.tenant_id));

drop policy if exists historical_occupancy_select on public.historical_occupancy;
create policy historical_occupancy_select on public.historical_occupancy
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = historical_occupancy.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists historical_occupancy_write on public.historical_occupancy;
create policy historical_occupancy_write on public.historical_occupancy
for all using (public.can_manage_tenant_data(historical_occupancy.tenant_id))
with check (public.can_manage_tenant_data(historical_occupancy.tenant_id));

drop policy if exists procountor_property_mappings_select on public.procountor_property_mappings;
create policy procountor_property_mappings_select on public.procountor_property_mappings
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = procountor_property_mappings.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists procountor_property_mappings_write on public.procountor_property_mappings;
create policy procountor_property_mappings_write on public.procountor_property_mappings
for all using (public.can_manage_tenant_data(procountor_property_mappings.tenant_id))
with check (public.can_manage_tenant_data(procountor_property_mappings.tenant_id));

drop policy if exists procountor_cc_map_select on public.procountor_cost_center_mappings;
create policy procountor_cc_map_select on public.procountor_cost_center_mappings
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = procountor_cost_center_mappings.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','customer_service','accounting','viewer','super_admin')
  )
);

drop policy if exists procountor_cc_map_write on public.procountor_cost_center_mappings;
create policy procountor_cc_map_write on public.procountor_cost_center_mappings
for all using (public.can_manage_tenant_data(procountor_cost_center_mappings.tenant_id))
with check (public.can_manage_tenant_data(procountor_cost_center_mappings.tenant_id));
