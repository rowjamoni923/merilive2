-- =============================================================================
-- Migrate ALL references from old (disabled) project URL to current project URL
-- Old: pppcwawjjpwwrmvezcdy.supabase.co  →  New: ayjdlvuurscxucatbbah.supabase.co
-- =============================================================================

DO $migrate$
DECLARE
  v_old_host TEXT := 'pppcwawjjpwwrmvezcdy.supabase.co';
  v_new_host TEXT := 'ayjdlvuurscxucatbbah.supabase.co';
  v_rec RECORD;
  v_sql TEXT;
  v_count INTEGER;
  v_total_updates INTEGER := 0;
BEGIN
  -- ============================================================
  -- 1. Update every text/varchar column in every public table
  -- ============================================================
  FOR v_rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'  -- skip views
      AND c.data_type IN ('text', 'character varying')
      AND c.is_generated = 'NEVER'
  LOOP
    BEGIN
      v_sql := format(
        'UPDATE public.%I SET %I = REPLACE(%I, %L, %L) WHERE %I LIKE %L',
        v_rec.table_name, v_rec.column_name, v_rec.column_name,
        v_old_host, v_new_host,
        v_rec.column_name, '%' || v_old_host || '%'
      );
      EXECUTE v_sql;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_total_updates := v_total_updates + v_count;
        RAISE NOTICE '[url-migrate] % rows in %.%', v_count, v_rec.table_name, v_rec.column_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[url-migrate] SKIP %.% — %', v_rec.table_name, v_rec.column_name, SQLERRM;
    END;
  END LOOP;

  -- ============================================================
  -- 2. Update jsonb columns that may contain the old URL as a string
  -- ============================================================
  FOR v_rec IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.data_type IN ('jsonb', 'json')
      AND c.is_generated = 'NEVER'
  LOOP
    BEGIN
      v_sql := format(
        'UPDATE public.%I SET %I = REPLACE(%I::text, %L, %L)::jsonb WHERE %I::text LIKE %L',
        v_rec.table_name, v_rec.column_name, v_rec.column_name,
        v_old_host, v_new_host,
        v_rec.column_name, '%' || v_old_host || '%'
      );
      EXECUTE v_sql;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      IF v_count > 0 THEN
        v_total_updates := v_total_updates + v_count;
        RAISE NOTICE '[url-migrate-json] % rows in %.%', v_count, v_rec.table_name, v_rec.column_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '[url-migrate-json] SKIP %.% — %', v_rec.table_name, v_rec.column_name, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '[url-migrate] DONE — total rows updated: %', v_total_updates;
END
$migrate$;

-- ============================================================
-- 3. Update cron jobs that reference the old project URL
-- ============================================================
DO $cron$
DECLARE
  v_job RECORD;
  v_new_command TEXT;
BEGIN
  FOR v_job IN
    SELECT jobid, jobname, schedule, command
    FROM cron.job
    WHERE command LIKE '%pppcwawjjpwwrmvezcdy%'
  LOOP
    v_new_command := REPLACE(v_job.command, 'pppcwawjjpwwrmvezcdy.supabase.co', 'ayjdlvuurscxucatbbah.supabase.co');
    PERFORM cron.alter_job(
      job_id  := v_job.jobid,
      command := v_new_command
    );
    RAISE NOTICE '[cron] Updated job % (id=%)', v_job.jobname, v_job.jobid;
  END LOOP;
END
$cron$;

-- ============================================================
-- 4. Verification: confirm no old URL remains in critical tables
-- ============================================================
DO $verify$
DECLARE
  v_remaining INTEGER := 0;
  v_cron_remaining INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_cron_remaining
  FROM cron.job WHERE command LIKE '%pppcwawjjpwwrmvezcdy%';

  IF v_cron_remaining > 0 THEN
    RAISE WARNING '[verify] % cron jobs still reference old URL', v_cron_remaining;
  ELSE
    RAISE NOTICE '[verify] ✓ No cron jobs reference old URL';
  END IF;
END
$verify$;