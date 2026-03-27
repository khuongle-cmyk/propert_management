-- Contacts directory search / filter acceleration
-- Run after crm_leads_pipeline.sql and billing_contracts_and_invoices.sql

create index if not exists leads_company_name_lc_idx on public.leads (lower(company_name));
create index if not exists leads_contact_name_lc_idx on public.leads (lower(contact_person_name));
create index if not exists leads_email_lc_idx on public.leads (lower(email));
create index if not exists leads_phone_idx on public.leads (phone);
create index if not exists leads_business_id_idx on public.leads (business_id);
create index if not exists leads_source_idx on public.leads (source);
create index if not exists leads_company_size_idx on public.leads (company_size);
create index if not exists leads_industry_idx on public.leads (industry_sector);
create index if not exists leads_move_in_idx on public.leads (preferred_move_in_date);
create index if not exists leads_updated_idx on public.leads (updated_at desc);

create index if not exists room_proposals_company_name_lc_idx on public.room_proposals (lower(tenant_company_name));
create index if not exists room_proposals_contact_lc_idx on public.room_proposals (lower(contact_person));
create index if not exists room_proposals_created_idx on public.room_proposals (created_at desc);

create index if not exists room_contracts_tenant_status_idx on public.room_contracts (tenant_id, status, start_date, end_date);
create index if not exists room_contracts_created_idx on public.room_contracts (created_at desc);
