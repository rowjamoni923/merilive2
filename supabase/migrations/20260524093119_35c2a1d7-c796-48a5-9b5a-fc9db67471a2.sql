-- Section #11 Pass-2: Live Streaming server-side eligibility enforcement

-- 1. BEFORE INSERT trigger: enforce host eligibility & sanitize start-time fields
CREATE OR REPLACE FUNCTION public.enforce_live_stream_insert_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profile RECORD;
BEGIN
  -- Admins (via active admin session) may create streams for any host (rare ops).
  IF public.is_active_admin_session() THEN
    RETURN NEW;
  END IF;

  -- host_id must match auth.uid() for non-admin inserts
  IF NEW.host_id IS NULL OR NEW.host_id <> auth.uid() THEN
    RAISE EXCEPTION 'live_stream.host_id must equal auth.uid()';
  END IF;

  -- Load host profile
  SELECT is_host, host_status, is_banned, is_blocked
    INTO v_profile
  FROM public.profiles
  WHERE id = NEW.host_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'host profile not found';
  END IF;

  IF v_profile.is_banned IS TRUE OR v_profile.is_blocked IS TRUE THEN
    RAISE EXCEPTION 'account is banned and cannot go live';
  END IF;

  IF v_profile.is_host IS NOT TRUE
     OR LOWER(COALESCE(v_profile.host_status, '')) <> 'approved' THEN
    RAISE EXCEPTION 'user is not an approved host';
  END IF;

  -- Active live-ban blocks going live
  IF public.is_user_live_banned(NEW.host_id) THEN
    RAISE EXCEPTION 'host has an active live ban';
  END IF;

  -- Sanitize economy & server-managed fields at start (host cannot pre-inflate)
  NEW.viewer_count       := 0;
  NEW.total_coins_earned := 0;
  NEW.total_gifts        := 0;
  NEW.ended_at           := NULL;
  NEW.is_active          := TRUE;
  NEW.started_at         := COALESCE(NEW.started_at, now());
  -- Server-managed RTMP/ingress/egress columns must be empty at start
  NEW.stream_key       := NULL;
  NEW.rtmp_url         := NULL;
  NEW.ingress_id       := NULL;
  NEW.ingress_type     := NULL;
  NEW.hls_egress_id    := NULL;
  NEW.hls_playlist_url := NULL;
  NEW.hls_status       := NULL;
  NEW.egress_id        := NULL;
  NEW.recording_status := NULL;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_live_stream_insert_eligibility ON public.live_streams;
CREATE TRIGGER trg_enforce_live_stream_insert_eligibility
  BEFORE INSERT ON public.live_streams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_live_stream_insert_eligibility();

-- 2. Sharpen "Anyone can view active streams" — keep active rows public,
--    let hosts/admins see their own ended rows; hide other users' ended history.
DROP POLICY IF EXISTS "Anyone can view active streams" ON public.live_streams;
CREATE POLICY "Anyone can view active streams"
  ON public.live_streams
  FOR SELECT
  USING (
    is_active = true
    OR host_id = auth.uid()
    OR public.is_active_admin_session()
  );

-- 3. Tighten host UPDATE policy: hosts can only flip is_active true→false
--    (ending their stream); cannot resurrect ended streams. Other safe fields
--    (title/description/thumbnail) still editable; guard_live_stream_fields
--    blocks economy columns.
DROP POLICY IF EXISTS "Hosts can update their own live streams" ON public.live_streams;
CREATE POLICY "Hosts can update their own live streams"
  ON public.live_streams
  FOR UPDATE
  USING (host_id = auth.uid() AND is_active = true)
  WITH CHECK (host_id = auth.uid());
