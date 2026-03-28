-- Tag historical costs as property-level vs organization administration.
-- Administration rows: property_id IS NULL, tenant_id set, cost_scope = 'administration'.

alter table public.historical_costs
  add column if not exists cost_scope text not null default 'property';

update public.historical_costs set cost_scope = 'property' where cost_scope is null;

alter table public.historical_costs
  drop constraint if exists historical_costs_cost_scope_check;

alter table public.historical_costs
  add constraint historical_costs_cost_scope_check check (
    cost_scope in ('property', 'administration')
  );

-- Allow NULL property_id only for administration.
alter table public.historical_costs
  drop constraint if exists historical_costs_property_id_fkey;

alter table public.historical_costs
  alter column property_id drop not null;

alter table public.historical_costs
  add constraint historical_costs_property_id_fkey
  foreign key (property_id) references public.properties(id) on delete cascade;

alter table public.historical_costs
  drop constraint if exists historical_costs_scope_property_consistency;

alter table public.historical_costs
  add constraint historical_costs_scope_property_consistency check (
    (cost_scope = 'property' and property_id is not null)
    or (cost_scope = 'administration' and property_id is null)
  );

create index if not exists historical_costs_tenant_scope_idx
  on public.historical_costs (tenant_id, cost_scope, year, month);

comment on column public.historical_costs.cost_scope is 'property = tied to property_id; administration = org central (property_id null).';
