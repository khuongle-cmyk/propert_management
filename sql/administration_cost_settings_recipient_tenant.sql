-- Fee recipient (counterparty) for administration / platform fee settings.
-- Run after public.tenants exists.

alter table public.administration_cost_settings
  add column if not exists recipient_tenant_id uuid references public.tenants (id);

create index if not exists administration_cost_settings_recipient_tenant_id_idx
  on public.administration_cost_settings (recipient_tenant_id);

comment on column public.administration_cost_settings.recipient_tenant_id is
  'Organization that receives this fee (counterparty to the payer tenant_id).';
