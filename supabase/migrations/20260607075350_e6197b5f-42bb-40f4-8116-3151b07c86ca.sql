-- Fix recursive live_streams <-> stream_viewers policies that can break live-room load
-- and prevent host heartbeat from starting.

CREATE OR REPLACE FUNCTION public.has_joined_live_stream(_stream_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stream_viewers sv
    WHERE sv.stream_id = _stream_id
      AND sv.viewer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_stream_viewer_row(_stream_id uuid, _viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer_id = auth.uid()
    OR public.is_active_admin_session()
    OR EXISTS (
      SELECT 1
      FROM public.live_streams ls
      WHERE ls.id = _stream_id
        AND (
          ls.host_id = auth.uid()
          OR COALESCE(ls.live_privacy, 'public') = 'public'
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_enter_live_stream_row(_stream_id uuid, _viewer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer_id = auth.uid()
    AND NOT public.is_user_live_banned(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.live_streams ls
      WHERE ls.id = _stream_id
        AND COALESCE(ls.is_active, false) = true
        AND ls.ended_at IS NULL
        AND (
          COALESCE(ls.live_privacy, 'public') = 'public'
          OR ls.host_id = auth.uid()
        )
    );
$$;

DROP POLICY IF EXISTS "Viewers can see ended live stream they joined" ON public.live_streams;
CREATE POLICY "Viewers can see ended live stream they joined"
ON public.live_streams
FOR SELECT
TO authenticated
USING (public.has_joined_live_stream(id));

DROP POLICY IF EXISTS "View stream viewers respecting privacy" ON public.stream_viewers;
CREATE POLICY "View stream viewers respecting privacy"
ON public.stream_viewers
FOR SELECT
TO public
USING (public.can_view_stream_viewer_row(stream_id, viewer_id));

DROP POLICY IF EXISTS "Users can enter active live streams" ON public.stream_viewers;
CREATE POLICY "Users can enter active live streams"
ON public.stream_viewers
FOR INSERT
TO authenticated
WITH CHECK (public.can_enter_live_stream_row(stream_id, viewer_id));

GRANT EXECUTE ON FUNCTION public.has_joined_live_stream(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_stream_viewer_row(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_enter_live_stream_row(uuid, uuid) TO authenticated, service_role;