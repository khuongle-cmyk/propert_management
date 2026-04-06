-- Optional: free-text deposit description for client-facing contract (numeric amount stays in deposit_amount where applicable)
ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS deposit_notes text;

COMMENT ON COLUMN public.contracts.deposit_notes IS 'Deposit description shown on the public contract (e.g. 2 months rent, bank guarantee).';
