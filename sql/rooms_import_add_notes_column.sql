-- =====================================================================
-- rooms_import_add_notes_column.sql
-- Adds a `notes` column to public.bookable_spaces so the Excel import
-- template can persist the "notes" field.
-- Safe to re-run.
-- =====================================================================

alter table public.bookable_spaces
  add column if not exists notes text;

