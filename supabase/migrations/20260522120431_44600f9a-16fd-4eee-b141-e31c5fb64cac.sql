-- Pkg97: LiveKit server-side webhook → Supabase truth
-- Closes orphan rooms when client crashes (Bigo/Tango pattern)

CREATE TABLE IF NOT EXISTS public.livekit_room_events (
  id bigserial PRIMARY KEY,
  event text NOT NULL,
  room_name text,
  room_sid text,
  participant_identity text,
  participant_sid text,
  track_sid text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lk_room_events_room_name_created
  ON public.livekit_room_events (room_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lk_room_events_event_created
  ON public.livekit_room_events (event, created_at DESC);

ALTER TABLE public.livekit_room_events ENABLE ROW LEVEL SECURITY;

-- Admins read all; nobody else reads. Writes are service-role only.
CREATE POLICY "Admins read livekit_room_events"
  ON public.livekit_room_events
  FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Auto-close room derived from LiveKit room_name convention:
--   live_<streamId>  → live_streams.is_active = false
--   party_<roomId>   → party_rooms.is_active = false
--   call_<callId>    → private_calls.status = 'ended'
CREATE OR REPLACE FUNCTION public.auto_close_room_from_livekit(_room_name text)
RETURNS TABLE (closed_kind text, closed_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
BEGIN
  IF _room_name IS NULL THEN RETURN; END IF;

  IF _room_name LIKE 'live_%' THEN
    v_id := substring(_room_name FROM 6);
    BEGIN
      UPDATE public.live_streams
         SET is_active = false,
             ended_at  = COALESCE(ended_at, now())
       WHERE id::text = v_id
         AND is_active = true;
      IF FOUND THEN
        closed_kind := 'live_stream'; closed_id := v_id; RETURN NEXT;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;

  ELSIF _room_name LIKE 'party_%' THEN
    v_id := substring(_room_name FROM 7);
    BEGIN
      UPDATE public.party_rooms
         SET is_active = false,
             ended_at  = COALESCE(ended_at, now())
       WHERE id::text = v_id
         AND is_active = true;
      IF FOUND THEN
        closed_kind := 'party_room'; closed_id := v_id; RETURN NEXT;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;

  ELSIF _room_name LIKE 'call_%' THEN
    v_id := substring(_room_name FROM 6);
    BEGIN
      UPDATE public.private_calls
         SET status   = 'ended',
             ended_at = COALESCE(ended_at, now())
       WHERE id::text = v_id
         AND status <> 'ended';
      IF FOUND THEN
        closed_kind := 'private_call'; closed_id := v_id; RETURN NEXT;
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_close_room_from_livekit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_close_room_from_livekit(text) TO service_role;