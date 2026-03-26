-- =====================================================================
-- Create room_combinations + room_photos (minimal) for Supabase
-- Run in SQL Editor AFTER public.bookable_spaces and public.properties exist.
--
-- Also run the rest of sql/rooms_management_upgrade.sql when you can, for:
-- bookable_spaces extra columns, status/type migrations, booking trigger,
-- storage bucket room-photos.
--
-- After running: Settings → API → Reload schema (or wait ~1 min) so the
-- client sees the new relationships.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---- room_combinations (merged room groups) ----
create table if not exists public.room_combinations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists room_combinations_property_id_idx
  on public.room_combinations (property_id);

create table if not exists public.room_combination_members (
  combination_id uuid not null references public.room_combinations(id) on delete cascade,
  space_id uuid not null references public.bookable_spaces(id) on delete cascade,
  primary key (combination_id, space_id)
);

create index if not exists room_combination_members_space_idx
  on public.room_combination_members (space_id);

-- ---- room_photos ----
create table if not exists public.room_photos (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.bookable_spaces(id) on delete cascade,
  storage_path text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists room_photos_space_id_idx on public.room_photos (space_id);

-- Optional: columns on bookable_spaces for merges (safe to re-run)
alter table public.bookable_spaces add column if not exists combination_id uuid references public.room_combinations(id) on delete set null;
alter table public.bookable_spaces add column if not exists is_combination_parent boolean not null default false;

create unique index if not exists bookable_spaces_one_combo_parent_idx
  on public.bookable_spaces (combination_id)
  where is_combination_parent = true and combination_id is not null;

-- ---- RLS ----
alter table public.room_combinations enable row level security;

drop policy if exists "room_combinations_select" on public.room_combinations;
create policy "room_combinations_select"
on public.room_combinations
for select
to authenticated
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1 from public.properties p
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where p.id = room_combinations.property_id
      and lower(m.role) in (
        'owner', 'manager', 'viewer', 'customer_service',
        'accounting', 'maintenance', 'tenant'
      )
  )
);

drop policy if exists "room_combinations_write" on public.room_combinations;
create policy "room_combinations_write"
on public.room_combinations
for all
to authenticated
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1 from public.properties p
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where p.id = room_combinations.property_id
      and lower(m.role) in ('owner', 'manager')
  )
)
with check (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1 from public.properties p
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where p.id = room_combinations.property_id
      and lower(m.role) in ('owner', 'manager')
  )
);

alter table public.room_combination_members enable row level security;

drop policy if exists "room_combination_members_select" on public.room_combination_members;
create policy "room_combination_members_select"
on public.room_combination_members
for select
to authenticated
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1
    from public.room_combinations rc
    join public.properties p on p.id = rc.property_id
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where rc.id = room_combination_members.combination_id
      and lower(m.role) in (
        'owner', 'manager', 'viewer', 'customer_service',
        'accounting', 'maintenance', 'tenant'
      )
  )
);

drop policy if exists "room_combination_members_write" on public.room_combination_members;
create policy "room_combination_members_write"
on public.room_combination_members
for all
to authenticated
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1
    from public.room_combinations rc
    join public.properties p on p.id = rc.property_id
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where rc.id = room_combination_members.combination_id
      and lower(m.role) in ('owner', 'manager')
  )
)
with check (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1
    from public.room_combinations rc
    join public.properties p on p.id = rc.property_id
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where rc.id = room_combination_members.combination_id
      and lower(m.role) in ('owner', 'manager')
  )
);

alter table public.room_photos enable row level security;

drop policy if exists "room_photos_select" on public.room_photos;
create policy "room_photos_select"
on public.room_photos
for select
to authenticated
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1
    from public.bookable_spaces bs
    join public.properties p on p.id = bs.property_id
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where bs.id = room_photos.space_id
      and lower(m.role) in (
        'owner', 'manager', 'viewer', 'customer_service',
        'accounting', 'maintenance', 'tenant'
      )
  )
);

drop policy if exists "room_photos_insert" on public.room_photos;
create policy "room_photos_insert"
on public.room_photos
for insert
to authenticated
with check (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1
    from public.bookable_spaces bs
    join public.properties p on p.id = bs.property_id
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where bs.id = room_photos.space_id
      and lower(m.role) in ('owner', 'manager')
  )
);

drop policy if exists "room_photos_delete" on public.room_photos;
create policy "room_photos_delete"
on public.room_photos
for delete
to authenticated
using (
  exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
  or exists (
    select 1
    from public.bookable_spaces bs
    join public.properties p on p.id = bs.property_id
    join public.memberships m on m.tenant_id = p.tenant_id and m.user_id = auth.uid()
    where bs.id = room_photos.space_id
      and lower(m.role) in ('owner', 'manager')
  )
);

comment on table public.room_combinations is 'Merged room groups; parent row lives in bookable_spaces when merge UI is used.';
comment on table public.room_photos is 'Image paths; use storage bucket room-photos when uploads are enabled.';
