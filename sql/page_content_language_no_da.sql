-- Allow Norwegian (no) and Danish (da) in page_content.language when the table exists.
-- Safe to run once; skips if `page_content` is not present.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'page_content'
  ) THEN
    -- Drop existing check constraint if named conventionally (adjust name to match your DB).
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'page_content_language_check'
    ) THEN
      ALTER TABLE public.page_content DROP CONSTRAINT page_content_language_check;
    END IF;

    ALTER TABLE public.page_content
      ADD CONSTRAINT page_content_language_check
      CHECK (language IN ('fi', 'en', 'sv', 'no', 'da', 'es', 'fr'));
  END IF;
END $$;
