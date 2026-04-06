-- Optional: ensure CRM pipeline archive flag exists (Sales Pipeline uses `archived`, not `is_archived`)
ALTER TABLE public.customer_companies
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.customer_companies.archived IS 'When true, lead is hidden from default pipeline unless "Show Archived" is on.';
