-- Block Supabase's public Data API (anon/authenticated roles) from SplitPro tables.
-- The app connects as the table owner, which bypasses RLS, so app behaviour is unchanged.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
