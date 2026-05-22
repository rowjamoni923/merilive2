CREATE TABLE IF NOT EXISTS public.call_e2ee_keys (
  call_id uuid PRIMARY KEY,
  passphrase text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_e2ee_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Call participants read e2ee key"
  ON public.call_e2ee_keys
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.private_calls pc
      WHERE pc.id = call_e2ee_keys.call_id
        AND (pc.caller_id = auth.uid() OR pc.host_id = auth.uid())
    )
  );

CREATE POLICY "Admin session manages e2ee keys"
  ON public.call_e2ee_keys
  FOR ALL
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE OR REPLACE FUNCTION public.ensure_call_e2ee_key(_call_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing text;
  v_new text;
  v_authorized boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.private_calls
    WHERE id = _call_id
      AND (caller_id = auth.uid() OR host_id = auth.uid())
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT passphrase INTO v_existing FROM public.call_e2ee_keys WHERE call_id = _call_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_new := encode(gen_random_bytes(32), 'base64');
  INSERT INTO public.call_e2ee_keys (call_id, passphrase)
  VALUES (_call_id, v_new)
  ON CONFLICT (call_id) DO UPDATE SET passphrase = call_e2ee_keys.passphrase
  RETURNING passphrase INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_call_e2ee_key(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.ensure_call_e2ee_key(uuid) TO authenticated;

UPDATE public.app_settings
SET setting_value = (
  COALESCE(setting_value::jsonb, '{}'::jsonb)
  || jsonb_build_object('e2ee', false)
)::text
WHERE setting_key = 'livekit_signaling_enabled'
  AND NOT (COALESCE(setting_value::jsonb, '{}'::jsonb) ? 'e2ee');
