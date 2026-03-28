-- =====================================================================
-- public_spaces_anon_rls.sql
-- Allow the Supabase anon role to read rows needed by GET /api/spaces/public
-- (Next.js route uses NEXT_PUBLIC_SUPABASE_ANON_KEY).
--
-- Prerequisite: run sql/bookable_spaces_is_published.sql so
--   public.bookable_spaces.is_published exists.
--
-- Aligns with the API filter:
--   is_published = true
--   AND space_status IN ('available', 'vacant')
--
-- Properties: anon may SELECT rows that have at least one such bookable_space
-- (so nested selects on bookable_spaces → properties work under RLS).
-- =====================================================================

alter table public.bookable_spaces enable row level security;
alter table public.properties enable row level security;

drop policy if exists "bookable_spaces_select_anon" on public.bookable_spaces;
create policy "bookable_spaces_select_anon"
on public.bookable_spaces
for select
to anon
using (
  is_published = true
  and space_status in ('available', 'vacant')
);

drop policy if exists "properties_select_anon_public_listings" on public.properties;
create policy "properties_select_anon_public_listings"
on public.properties
for select
to anon
using (
  exists (
    select 1
    from public.bookable_spaces bs
    where bs.property_id = properties.id
      and bs.is_published = true
      and bs.space_status in ('available', 'vacant')
  )
);
