-- Fix cleanup_stale_party_participants_v2: replace non-existent
-- `last_activity_at` with the real `updated_at` column on party_rooms.
-- Widen stale window 90s -> 3 minutes (matches Pkg426 Live Stream window)
-- so brief host disconnects don't trigger the
-- check_room_active_on_participant_leave room-close cascade.
CREATE OR REPLACE FUNCTION public.cleanup_stale_party_participants_v2()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.party_room_participants
     SET left_at = now()
   WHERE left_at IS NULL
     AND last_seen_at < now() - interval '3 minutes';

  UPDATE public.party_rooms r
     SET updated_at = greatest(coalesce(r.updated_at, r.created_at), now())
   WHERE EXISTS (
     SELECT 1 FROM public.party_room_participants p
      WHERE p.room_id = r.id AND p.left_at IS NULL
   );
END;
$function$;

-- Fix cleanup_stale_party_rooms: same column rename + same 3 min window.
CREATE OR REPLACE FUNCTION public.cleanup_stale_party_rooms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  closed_count integer := 0;
BEGIN
  UPDATE public.party_room_participants p
     SET left_at = now()
    FROM public.party_rooms pr
   WHERE p.room_id = pr.id
     AND p.left_at IS NULL
     AND coalesce(pr.is_active, false) = true
     AND coalesce(pr.updated_at, pr.created_at) < now() - interval '15 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.party_room_participants p2
        WHERE p2.room_id = pr.id
          AND p2.left_at IS NULL
          AND coalesce(p2.last_seen_at, p2.joined_at) > now() - interval '3 minutes'
     );

  UPDATE public.party_rooms pr
     SET is_active = false,
         ended_at = coalesce(pr.ended_at, now())
   WHERE coalesce(pr.is_active, false) = true
     AND coalesce(pr.updated_at, pr.created_at) < now() - interval '15 minutes'
     AND NOT EXISTS (
       SELECT 1 FROM public.party_room_participants p2
        WHERE p2.room_id = pr.id
          AND p2.left_at IS NULL
          AND coalesce(p2.last_seen_at, p2.joined_at) > now() - interval '3 minutes'
     );

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$function$;