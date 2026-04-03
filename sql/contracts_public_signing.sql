-- Public e-sign link for contract tool (public.contracts)
-- Used by /api/contracts/[token]/sign and copy-link flows once editors persist public_token.

alter table public.contracts
  add column if not exists public_token text,
  add column if not exists signed_at timestamptz;

create unique index if not exists contracts_public_token_uq
  on public.contracts (public_token)
  where public_token is not null;
