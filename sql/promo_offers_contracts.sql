-- Promo metadata on contract-tool offers & contracts (editors: promoCode → promo_code, etc.)
alter table public.offers
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric(14, 4),
  add column if not exists promo_description text,
  add column if not exists promo_type text;

alter table public.contracts
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric(14, 4),
  add column if not exists promo_description text,
  add column if not exists promo_type text;

alter table public.offers
  add column if not exists promo_applies_to text;

alter table public.contracts
  add column if not exists promo_applies_to text;
