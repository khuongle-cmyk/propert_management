-- Add background_opacity if an older DB is missing the column (fixes API/select errors).
alter table public.floor_plans
  add column if not exists background_opacity numeric(5, 4) not null default 0.5;
