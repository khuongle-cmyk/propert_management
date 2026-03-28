-- Public marketing: only spaces with is_published = true appear on CMS home / public listings.
-- Run in Supabase SQL Editor after core schema (idempotent).

alter table public.bookable_spaces
  add column if not exists is_published boolean not null default true;

update public.bookable_spaces
set is_published = true;

comment on column public.bookable_spaces.is_published is
  'When true, the space may be listed on the public website (subject to space_status and CMS allowlists).';
