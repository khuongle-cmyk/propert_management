-- Optional: CRM lifecycle distinct from pipeline stage (run in Supabase SQL Editor if not present)
alter table public.leads add column if not exists status text;

comment on column public.leads.status is 'CRM lifecycle after conversion, e.g. customer.';
