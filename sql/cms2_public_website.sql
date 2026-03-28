-- CMS 2: public marketing site per organization (slug + JSON settings).
-- Run in Supabase after core tenants / brand_settings exist.

alter table public.tenants
  add column if not exists public_slug text;

create unique index if not exists tenants_public_slug_lower_idx
  on public.tenants (lower(public_slug))
  where public_slug is not null and length(trim(public_slug)) > 0;

create table if not exists public.tenant_public_website (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  slug text not null,
  published boolean not null default false,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint tenant_public_website_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

create unique index if not exists tenant_public_website_slug_lower_idx
  on public.tenant_public_website (lower(slug));

alter table public.tenant_public_website enable row level security;

drop policy if exists tenant_public_website_public_read on public.tenant_public_website;
create policy tenant_public_website_public_read on public.tenant_public_website
  for select using (published = true);

drop policy if exists tenant_public_website_member_all on public.tenant_public_website;
create policy tenant_public_website_member_all on public.tenant_public_website
  for all using (public.can_manage_tenant_data(tenant_id))
  with check (public.can_manage_tenant_data(tenant_id));

comment on table public.tenant_public_website is 'CMS 2 public website content; slug used in URLs /{slug}/…';
