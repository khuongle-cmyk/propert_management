-- White-label / multi-brand settings + tenant pricing tiers

alter table public.tenants
  add column if not exists plan text not null default 'starter'
  check (plan in ('starter', 'professional', 'enterprise'));

create table if not exists public.brand_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade unique,
  brand_name text not null,
  custom_domain text unique,
  logo_url text,
  logo_white_url text,
  favicon_url text,
  primary_color text not null default '#1a5c5a',
  secondary_color text not null default '#2d8b87',
  background_color text not null default '#f8fafa',
  sidebar_color text not null default '#0d3d3b',
  text_color text not null default '#1a2e2e',
  accent_color text not null default '#e8f4f3',
  font_family text,
  login_page_headline text,
  login_page_subheadline text,
  login_page_background_image_url text,
  email_sender_name text,
  email_sender_address text,
  email_footer_text text,
  email_logo_url text,
  support_email text,
  support_phone text,
  support_url text,
  hide_powered_by boolean not null default false,
  powered_by_text text not null default 'Powered by VillageWorks',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_settings_active_domain_idx
  on public.brand_settings(custom_domain, is_active);

create index if not exists brand_settings_tenant_idx
  on public.brand_settings(tenant_id);

alter table public.brand_settings enable row level security;

drop policy if exists brand_settings_public_domain_select on public.brand_settings;
create policy brand_settings_public_domain_select on public.brand_settings
for select using (
  is_active = true
);

drop policy if exists brand_settings_membership_select on public.brand_settings;
create policy brand_settings_membership_select on public.brand_settings
for select using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and m.tenant_id = brand_settings.tenant_id
  )
);

drop policy if exists brand_settings_manage_write on public.brand_settings;
create policy brand_settings_manage_write on public.brand_settings
for all using (
  public.can_manage_tenant_data(brand_settings.tenant_id)
)
with check (
  public.can_manage_tenant_data(brand_settings.tenant_id)
);

drop policy if exists brand_settings_super_admin_write on public.brand_settings;
create policy brand_settings_super_admin_write on public.brand_settings
for all using (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and lower(coalesce(m.role, '')) = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid()
      and lower(coalesce(m.role, '')) = 'super_admin'
  )
);

