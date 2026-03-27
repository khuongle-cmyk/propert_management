-- Manual billing system (Stripe placeholder only)

create extension if not exists pgcrypto;

alter table public.tenants
  add column if not exists trial_starts_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists trial_status text not null default 'none'
    check (trial_status in ('none', 'active', 'expired', 'converted'));

create table if not exists public.pricing_plans (
  id text primary key check (id in ('starter', 'professional', 'enterprise')),
  display_name text not null,
  monthly_base_fee numeric(12,2) not null default 0,
  included_properties integer not null default 0,
  per_property_fee numeric(12,2) not null default 0,
  included_users integer not null default 0,
  per_user_fee numeric(12,2) not null default 0,
  trial_days integer not null default 14,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.pricing_plans
  (id, display_name, monthly_base_fee, included_properties, per_property_fee, included_users, per_user_fee, trial_days, is_active, notes)
values
  ('starter', 'Starter', 0, 1, 29, 3, 9, 14, true, 'VillageWorks branding only'),
  ('professional', 'Professional', 199, 5, 39, 10, 12, 14, true, 'Custom logo and colors'),
  ('enterprise', 'Enterprise', 499, 9999, 0, 9999, 0, 30, true, 'Full white-label and custom domain')
on conflict (id) do nothing;

create table if not exists public.tenant_billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  label text not null,
  reason text,
  amount numeric(12,2) not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists tenant_billing_adjustments_tenant_month_idx
  on public.tenant_billing_adjustments(tenant_id, billing_month);

create table if not exists public.billing_usage_monthly (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  plan_id text not null references public.pricing_plans(id),
  active_properties integer not null default 0,
  active_users integer not null default 0,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, billing_month)
);
create index if not exists billing_usage_monthly_tenant_month_idx
  on public.billing_usage_monthly(tenant_id, billing_month);

create table if not exists public.manual_billing_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_number text not null unique,
  billing_month date not null check (billing_month = date_trunc('month', billing_month)::date),
  issue_date date not null,
  due_date date not null,
  currency text not null default 'EUR',
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
  recipient_name text,
  recipient_email text,
  sender_name text,
  sender_email text,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  notes text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists manual_billing_invoices_tenant_month_idx
  on public.manual_billing_invoices(tenant_id, billing_month);

create table if not exists public.manual_billing_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.manual_billing_invoices(id) on delete cascade,
  item_type text not null check (item_type in ('plan', 'property_overage', 'user_overage', 'adjustment', 'trial_credit', 'manual')),
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists manual_billing_invoice_items_invoice_idx
  on public.manual_billing_invoice_items(invoice_id);

alter table public.pricing_plans enable row level security;
alter table public.tenant_billing_adjustments enable row level security;
alter table public.billing_usage_monthly enable row level security;
alter table public.manual_billing_invoices enable row level security;
alter table public.manual_billing_invoice_items enable row level security;

drop policy if exists pricing_plans_read on public.pricing_plans;
create policy pricing_plans_read on public.pricing_plans
for select using (true);

drop policy if exists pricing_plans_write on public.pricing_plans;
create policy pricing_plans_write on public.pricing_plans
for all using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and lower(coalesce(m.role,'')) = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and lower(coalesce(m.role,'')) = 'super_admin'
  )
);

drop policy if exists tenant_billing_adjustments_select on public.tenant_billing_adjustments;
create policy tenant_billing_adjustments_select on public.tenant_billing_adjustments
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = tenant_billing_adjustments.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','accounting','viewer','super_admin')
  )
);
drop policy if exists tenant_billing_adjustments_write on public.tenant_billing_adjustments;
create policy tenant_billing_adjustments_write on public.tenant_billing_adjustments
for all using (public.can_manage_tenant_data(tenant_billing_adjustments.tenant_id))
with check (public.can_manage_tenant_data(tenant_billing_adjustments.tenant_id));

drop policy if exists billing_usage_monthly_select on public.billing_usage_monthly;
create policy billing_usage_monthly_select on public.billing_usage_monthly
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = billing_usage_monthly.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','accounting','viewer','super_admin')
  )
);
drop policy if exists billing_usage_monthly_write on public.billing_usage_monthly;
create policy billing_usage_monthly_write on public.billing_usage_monthly
for all using (public.can_manage_tenant_data(billing_usage_monthly.tenant_id))
with check (public.can_manage_tenant_data(billing_usage_monthly.tenant_id));

drop policy if exists manual_billing_invoices_select on public.manual_billing_invoices;
create policy manual_billing_invoices_select on public.manual_billing_invoices
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = manual_billing_invoices.tenant_id
      and lower(coalesce(m.role,'')) in ('owner','manager','accounting','viewer','super_admin')
  )
);
drop policy if exists manual_billing_invoices_write on public.manual_billing_invoices;
create policy manual_billing_invoices_write on public.manual_billing_invoices
for all using (public.can_manage_tenant_data(manual_billing_invoices.tenant_id))
with check (public.can_manage_tenant_data(manual_billing_invoices.tenant_id));

drop policy if exists manual_billing_invoice_items_select on public.manual_billing_invoice_items;
create policy manual_billing_invoice_items_select on public.manual_billing_invoice_items
for select using (
  exists (
    select 1
    from public.manual_billing_invoices i
    join public.memberships m on m.tenant_id = i.tenant_id and m.user_id = auth.uid()
    where i.id = manual_billing_invoice_items.invoice_id
      and lower(coalesce(m.role,'')) in ('owner','manager','accounting','viewer','super_admin')
  )
);
drop policy if exists manual_billing_invoice_items_write on public.manual_billing_invoice_items;
create policy manual_billing_invoice_items_write on public.manual_billing_invoice_items
for all using (
  exists (
    select 1
    from public.manual_billing_invoices i
    where i.id = manual_billing_invoice_items.invoice_id
      and public.can_manage_tenant_data(i.tenant_id)
  )
)
with check (
  exists (
    select 1
    from public.manual_billing_invoices i
    where i.id = manual_billing_invoice_items.invoice_id
      and public.can_manage_tenant_data(i.tenant_id)
  )
);

