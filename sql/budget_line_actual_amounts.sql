-- Optional columns for Varjo-style imports (budget + toteuma on same plan).
-- Run after budget_planning.sql.

alter table public.budget_revenue_lines
  add column if not exists actual_amount numeric(16, 2) not null default 0;

alter table public.budget_cost_lines
  add column if not exists actual_amount numeric(16, 2) not null default 0;

alter table public.budget_headcount_lines
  add column if not exists actual_monthly_cost numeric(16, 2) not null default 0;

comment on column public.budget_revenue_lines.actual_amount is 'Year-to-date / realized revenue for the month (imported actuals).';
comment on column public.budget_cost_lines.actual_amount is 'Year-to-date / realized cost for the month (imported actuals).';
comment on column public.budget_headcount_lines.actual_monthly_cost is 'Realized payroll cost for the month when imported from actuals.';
