-- Floor plan background images — public bucket `floor-plans`
-- Run in Supabase SQL Editor if uploads return 500 / storage errors.

insert into storage.buckets (id, name, public)
values ('floor-plans', 'floor-plans', true)
on conflict (id) do update set public = true;

drop policy if exists "floor plans public read" on storage.objects;
create policy "floor plans public read"
on storage.objects
for select
to public
using (bucket_id = 'floor-plans');

drop policy if exists "floor plans authenticated insert" on storage.objects;
create policy "floor plans authenticated insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'floor-plans'
  and (
    exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and lower(m.role) in ('owner', 'manager')
    )
  )
);

drop policy if exists "floor plans authenticated update" on storage.objects;
create policy "floor plans authenticated update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'floor-plans'
  and (
    exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and lower(m.role) in ('owner', 'manager')
    )
  )
);

drop policy if exists "floor plans authenticated delete" on storage.objects;
create policy "floor plans authenticated delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'floor-plans'
  and (
    exists (select 1 from public.memberships m where m.user_id = auth.uid() and lower(m.role) = 'super_admin')
    or exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid() and lower(m.role) in ('owner', 'manager')
    )
  )
);
