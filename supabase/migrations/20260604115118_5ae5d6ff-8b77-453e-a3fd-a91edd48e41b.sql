ALTER TABLE public.party_room_participants
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_party_room_participants_active_last_seen
  ON public.party_room_participants (room_id, last_seen_at)
  WHERE left_at IS NULL;

CREATE OR REPLACE FUNCTION public.party_participant_heartbeat(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.party_room_participants
     SET last_seen_at = now()
   WHERE room_id = p_room_id
     AND user_id = v_uid
     AND left_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.party_participant_heartbeat(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.party_participant_heartbeat(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.party_participant_heartbeat(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cleanup_stale_party_participants_v2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.party_room_participants
     SET left_at = now()
   WHERE left_at IS NULL
     AND last_seen_at < now() - interval '90 seconds';

  UPDATE public.party_rooms r
     SET last_activity_at = greatest(coalesce(r.last_activity_at, r.created_at), now())
   WHERE EXISTS (
     SELECT 1 FROM public.party_room_participants p
      WHERE p.room_id = r.id AND p.left_at IS NULL
   );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_stale_party_participants_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_stale_party_participants_v2() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_party_participants_v2() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule('cleanup_stale_party_participants_every_minute');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cleanup_stale_party_participants_every_minute',
  '* * * * *',
  $cron$ SELECT public.cleanup_stale_party_participants_v2(); $cron$
);