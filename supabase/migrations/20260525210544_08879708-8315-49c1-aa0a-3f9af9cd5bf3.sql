CREATE OR REPLACE FUNCTION public.is_party_room_active_participant(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.party_room_participants prp
    WHERE prp.room_id = p_room_id
      AND prp.user_id = p_user_id
      AND prp.left_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_party_room_host(p_room_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.party_rooms pr
    WHERE pr.id = p_room_id
      AND pr.host_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_party_room_active_participant(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_party_room_host(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_party_room_active_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_party_room_active_participant(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_party_room_host(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_party_room_host(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS a_read_party_part ON public.party_room_participants;
DROP POLICY IF EXISTS a_upd_party_part_self ON public.party_room_participants;
DROP POLICY IF EXISTS "Users can leave rooms" ON public.party_room_participants;
DROP POLICY IF EXISTS "Users can update own party participant" ON public.party_room_participants;

CREATE POLICY a_read_party_part
ON public.party_room_participants
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_party_room_host(room_id, auth.uid())
  OR public.is_party_room_active_participant(room_id, auth.uid())
  OR public.is_active_admin_session()
);

CREATE POLICY a_upd_party_part_self
ON public.party_room_participants
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
