-- Backfill historical_costs.cost_type from account_code for Procountor P&L imports.
-- Specific accounts are applied before broad ranges (e.g. 4491 before 4450–4499).
-- Run in Supabase SQL Editor.

WITH parsed AS (
  SELECT
    id,
    CASE
      WHEN account_code IS NULL OR btrim(account_code) = '' THEN NULL
      WHEN btrim(account_code) ~ '^[0-9]{4,5}' THEN
        (substring(btrim(account_code) from '^([0-9]{4,5})'))::integer
      ELSE NULL
    END AS acct
  FROM public.historical_costs
  WHERE data_source = 'procountor_tuloslaskelma'
),
mapped AS (
  SELECT
    id,
    CASE
      WHEN acct IS NULL THEN NULL
      WHEN acct BETWEEN 4000 AND 4099 THEN 'cleaning'
      WHEN acct = 4491 THEN 'cleaning'
      WHEN acct = 4492 THEN 'other_one_off'
      WHEN acct IN (4493, 44933) OR (acct BETWEEN 44930 AND 44933) THEN 'it_infrastructure'
      WHEN acct IN (4494, 44941) THEN 'other_one_off'
      WHEN acct IN (4495, 44951) THEN 'other_one_off'
      WHEN acct = 4496 THEN 'marketing'
      WHEN acct BETWEEN 4450 AND 4499 THEN 'property_management'
      WHEN acct = 4500 THEN 'other_one_off'
      WHEN acct = 4501 THEN 'utilities'
      WHEN acct IN (4600, 4601) THEN 'it_infrastructure'
      WHEN acct IN (4602, 4603, 4605, 4610) THEN 'other_one_off'
      WHEN acct BETWEEN 5000 AND 5990 THEN 'staff'
      WHEN acct BETWEEN 6130 AND 6410 THEN 'staff'
      WHEN acct BETWEEN 7010 AND 7170 THEN 'staff'
      WHEN acct BETWEEN 7610 AND 7770 THEN 'other_one_off'
      WHEN acct = 7800 THEN 'other_one_off'
      WHEN acct IN (8000, 8050) THEN 'marketing'
      WHEN acct = 8380 THEN 'property_management'
      WHEN acct BETWEEN 8500 AND 8680 THEN 'other_one_off'
      WHEN acct = 9160 THEN 'other_one_off'
      WHEN acct = 9440 THEN 'other_one_off'
      ELSE NULL
    END AS new_type
  FROM parsed
  WHERE acct IS NOT NULL
)
UPDATE public.historical_costs hc
SET cost_type = m.new_type
FROM mapped m
WHERE hc.id = m.id
  AND m.new_type IS NOT NULL;
