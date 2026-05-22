ALTER TABLE public.live_streams
  ADD COLUMN IF NOT EXISTS ingress_id text,
  ADD COLUMN IF NOT EXISTS rtmp_url text,
  ADD COLUMN IF NOT EXISTS stream_key text,
  ADD COLUMN IF NOT EXISTS ingress_type text;

UPDATE public.app_settings
SET setting_value = jsonb_set(
  COALESCE(setting_value::jsonb, '{}'::jsonb),
  '{ingress}',
  'false'::jsonb,
  true
)::text
WHERE setting_key = 'livekit_signaling_enabled';

CREATE OR REPLACE FUNCTION public.get_live_stream_ingress(_stream_id uuid)
RETURNS TABLE(ingress_id text, rtmp_url text, stream_key text, ingress_type text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  RETURN QUERY
  SELECT ls.ingress_id, ls.rtmp_url, ls.stream_key, ls.ingress_type
  FROM public.live_streams ls
  WHERE ls.id = _stream_id
    AND ls.host_id = auth.uid()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_stream_ingress(uuid) TO authenticated;