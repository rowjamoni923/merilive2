DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables ppt
      WHERE ppt.pubname = 'supabase_realtime'
        AND ppt.schemaname = r.schemaname
        AND ppt.tablename = r.tablename
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', r.schemaname, r.tablename);
    END IF;
  END LOOP;
END $$;