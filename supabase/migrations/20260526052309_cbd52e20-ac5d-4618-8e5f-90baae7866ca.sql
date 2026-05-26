-- Pkg364: complete admin zero-refresh trigger coverage + remove duplicate trigger fires.
-- No new realtime channels. Everything still flows through the existing admin_broadcast singleton.

DO $$
DECLARE
  t text;
  missing_tables text[] := ARRAY[
    'agent_dispatches',
    'rating_reward_audit_log',
    'stream_recordings',
    'system_error_logs',
    'track_recordings'
  ];
BEGIN
  FOREACH t IN ARRAY missing_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO public.admin_broadcast (topic, version, last_event, last_row_id, updated_at)
         VALUES (%L, 0, ''INIT'', NULL, now())
         ON CONFLICT (topic) DO NOTHING',
        t
      );

      EXECUTE format('DROP TRIGGER IF EXISTS tg_admin_broadcast_%I ON public.%I', t, t);
      EXECUTE format('DROP TRIGGER IF EXISTS pkg364_admin_broadcast_bump ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER tg_admin_broadcast_%I
           AFTER INSERT OR UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump(%L)',
        t, t, t
      );
    END IF;
  END LOOP;
END $$;

-- Pkg362 later overlapped with older tg_admin_broadcast_* triggers on these
-- tables. One trigger is enough because tg_admin_broadcast_bump already has a
-- 500ms topic debounce + hourly cap; duplicates only waste event budget.
DO $$
DECLARE
  t text;
  dup_tables text[] := ARRAY[
    'admin_pending_actions',
    'agency_commission_history',
    'gift_transactions',
    'moderation_audit_log',
    'ranking_rewards',
    'support_reports'
  ];
BEGIN
  FOREACH t IN ARRAY dup_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS pkg362_admin_broadcast_bump ON public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMENT ON TABLE public.admin_broadcast IS
'Admin/app instant sync topic table. Pkg364 completed missing admin trigger coverage and removed duplicate trigger fires; still uses one singleton realtime subscription with kill switch/cap.';