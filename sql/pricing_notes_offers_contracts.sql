-- Optional notes shown under pricing on offer/contract documents (editors: pricingNotes → pricing_notes)
alter table public.offers
  add column if not exists pricing_notes text;

alter table public.contracts
  add column if not exists pricing_notes text;
