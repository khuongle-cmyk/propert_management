-- Furniture package fields (editors: furniture* → furniture_*)
alter table public.offers
  add column if not exists furniture_included boolean not null default false,
  add column if not exists furniture_description text,
  add column if not exists furniture_monthly_price numeric(12, 2);

alter table public.contracts
  add column if not exists furniture_included boolean not null default false,
  add column if not exists furniture_description text,
  add column if not exists furniture_monthly_price numeric(12, 2);
