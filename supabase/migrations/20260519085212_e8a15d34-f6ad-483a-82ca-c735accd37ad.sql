
-- 1. Mirror table for fast realtime broadcast of the active session
CREATE TABLE IF NOT EXISTS public.user_active_sessions (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  device_info jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users read own active session" ON public.user_active_sessions;
CREATE POLICY "users read own active session"
  ON public.user_active_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Required for postgres_changes UPDATE payloads to include old + new values
ALTER TABLE public.user_active_sessions REPLICA IDENTITY FULL;

-- Add to realtime publication (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_active_sessions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_active_sessions';
  END IF;
END $$;

-- 2. Update RPC to mirror writes
CREATE OR REPLACE FUNCTION public.update_active_session(_session_id text, _device_info jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE profiles SET active_session_id = _session_id, last_active_at = now() WHERE id = auth.uid();

  INSERT INTO public.user_active_sessions (user_id, session_id, device_info, updated_at)
  VALUES (auth.uid(), _session_id, _device_info, now())
  ON CONFLICT (user_id) DO UPDATE
    SET session_id = EXCLUDED.session_id,
        device_info = EXCLUDED.device_info,
        updated_at = now();
END;
$function$;

-- 3. Backfill from current profiles so no user is missing
INSERT INTO public.user_active_sessions (user_id, session_id, updated_at)
SELECT id, active_session_id, COALESCE(last_active_at, now())
FROM public.profiles
WHERE active_session_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
