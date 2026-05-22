-- Pkg87 deep audit fix: align live PartyRoom seat request app contract with DB
-- Actual DB had user_id/seat_number while the app reads/writes requester_id/seat_position.
-- This caused request/approve/cancel paths to fail or return missing data.

ALTER TABLE public.seat_requests
  ADD COLUMN IF NOT EXISTS requester_id uuid,
  ADD COLUMN IF NOT EXISTS seat_position integer;

UPDATE public.seat_requests
SET
  requester_id = COALESCE(requester_id, user_id),
  seat_position = COALESCE(seat_position, seat_number)
WHERE requester_id IS NULL OR seat_position IS NULL;

CREATE OR REPLACE FUNCTION public.sync_seat_request_alias_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- App-facing names → legacy/canonical names
  IF NEW.user_id IS NULL AND NEW.requester_id IS NOT NULL THEN
    NEW.user_id := NEW.requester_id;
  END IF;

  IF NEW.seat_number IS NULL AND NEW.seat_position IS NOT NULL THEN
    NEW.seat_number := NEW.seat_position;
  END IF;

  -- Legacy/canonical names → app-facing names
  IF NEW.requester_id IS NULL AND NEW.user_id IS NOT NULL THEN
    NEW.requester_id := NEW.user_id;
  END IF;

  IF NEW.seat_position IS NULL AND NEW.seat_number IS NOT NULL THEN
    NEW.seat_position := NEW.seat_number;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_seat_request_alias_columns ON public.seat_requests;
CREATE TRIGGER trg_sync_seat_request_alias_columns
BEFORE INSERT OR UPDATE ON public.seat_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_seat_request_alias_columns();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.seat_requests'::regclass
      AND conname = 'seat_requests_status_check'
  ) THEN
    ALTER TABLE public.seat_requests DROP CONSTRAINT seat_requests_status_check;
  END IF;
END $$;

ALTER TABLE public.seat_requests
  ADD CONSTRAINT seat_requests_status_check
  CHECK (status = ANY (ARRAY['pending','approved','rejected','expired','cancelled']));

CREATE INDEX IF NOT EXISTS idx_seat_requests_requester_id ON public.seat_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_seat_requests_room_status ON public.seat_requests(room_id, status);

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

-- Keep older policies functional even if either column family is used.
DROP POLICY IF EXISTS "Requester and host can view seat requests" ON public.seat_requests;
CREATE POLICY "Requester and host can view seat requests"
ON public.seat_requests
FOR SELECT
TO authenticated
USING (
  auth.uid() = COALESCE(requester_id, user_id)
  OR EXISTS (
    SELECT 1 FROM public.party_rooms r
    WHERE r.id = seat_requests.room_id
      AND r.host_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "u_ins_seat_req" ON public.seat_requests;
CREATE POLICY "u_ins_seat_req"
ON public.seat_requests
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = COALESCE(requester_id, user_id));

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
