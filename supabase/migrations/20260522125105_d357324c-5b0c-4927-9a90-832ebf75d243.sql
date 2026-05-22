ALTER TABLE public.private_calls
  ADD COLUMN IF NOT EXISTS e2ee_key text;

COMMENT ON COLUMN public.private_calls.e2ee_key IS
  'Pkg108: base64 32-byte symmetric key for LiveKit E2EE. Lazily generated on first get_call_e2ee_key() call. Only readable to caller_id+host_id via the RPC (no direct SELECT).';

UPDATE public.app_settings
SET setting_value = jsonb_set(
  COALESCE(setting_value::jsonb, '{}'::jsonb),
  '{e2ee}',
  'false'::jsonb,
  true
)::text
WHERE setting_key = 'livekit_signaling_enabled'
  AND COALESCE((setting_value::jsonb) ? 'e2ee', false) = false;

CREATE OR REPLACE FUNCTION public.get_call_e2ee_key(_call_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_caller uuid;
  v_host uuid;
  v_key text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT caller_id, host_id, e2ee_key
    INTO v_caller, v_host, v_key
  FROM public.private_calls
  WHERE id = _call_id;

  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'call_not_found';
  END IF;

  IF v_uid <> v_caller AND v_uid <> v_host THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_key IS NULL THEN
    v_key := encode(gen_random_bytes(32), 'base64');
    UPDATE public.private_calls
       SET e2ee_key = v_key
     WHERE id = _call_id
       AND e2ee_key IS NULL
    RETURNING e2ee_key INTO v_key;

    IF v_key IS NULL THEN
      SELECT e2ee_key INTO v_key
      FROM public.private_calls
      WHERE id = _call_id;
    END IF;
  END IF;

  RETURN v_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_call_e2ee_key(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_call_e2ee_key(uuid) TO authenticated;