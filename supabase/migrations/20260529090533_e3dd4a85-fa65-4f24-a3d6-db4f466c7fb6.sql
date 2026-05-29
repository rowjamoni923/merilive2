DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'seat_requests'
  ) THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.seat_requests TO authenticated;
    GRANT ALL ON public.seat_requests TO service_role;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'seat_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.seat_requests;
  END IF;
END $$;

ALTER TABLE public.seat_requests REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Requester and host can view seat requests" ON public.seat_requests;
CREATE POLICY "Requester and host can view seat requests"
ON public.seat_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = COALESCE(requester_id, user_id)
  OR EXISTS (
    SELECT 1
    FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id
      AND r.host_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Room host can respond to seat requests" ON public.seat_requests;
CREATE POLICY "Room host can respond to seat requests"
ON public.seat_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id
      AND r.host_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id
      AND r.host_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Requester can cancel own seat request" ON public.seat_requests;
CREATE POLICY "Requester can cancel own seat request"
ON public.seat_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() = COALESCE(requester_id, user_id)
  AND status = 'pending'
)
WITH CHECK (
  auth.uid() = COALESCE(requester_id, user_id)
  AND status = 'cancelled'
);

DROP POLICY IF EXISTS u_ins_seat_req ON public.seat_requests;
CREATE POLICY u_ins_seat_req
ON public.seat_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = COALESCE(requester_id, user_id)
  AND (status IS NULL OR status = 'pending')
  AND responded_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.party_rooms r
    WHERE r.id = room_id
      AND r.is_active = true
  )
);