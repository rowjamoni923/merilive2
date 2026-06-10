CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_active_device_id_unique
ON public.profiles (device_id)
WHERE device_id IS NOT NULL
  AND COALESCE(is_deleted, false) = false;

CREATE OR REPLACE FUNCTION public.bind_own_device_id(p_device_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_device_id text := left(coalesce(p_device_id, ''), 160);
  v_existing_owner uuid;
  v_current_device text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF v_device_id !~ '^device_[A-Za-z0-9_:-]{6,128}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_device_id');
  END IF;

  SELECT p.id
    INTO v_existing_owner
    FROM public.profiles p
    WHERE p.device_id = v_device_id
      AND p.id <> v_user_id
      AND COALESCE(p.is_deleted, false) = false
    LIMIT 1;

  IF v_existing_owner IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'device_already_bound');
  END IF;

  SELECT p.device_id
    INTO v_current_device
    FROM public.profiles p
    WHERE p.id = v_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF v_current_device IS NOT NULL AND v_current_device IS DISTINCT FROM v_device_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_already_bound');
  END IF;

  UPDATE public.profiles
     SET device_id = v_device_id,
         updated_at = now()
   WHERE id = v_user_id
     AND (device_id IS NULL OR device_id = v_device_id);

  RETURN jsonb_build_object('success', true, 'device_id', v_device_id);
END;
$$;

REVOKE ALL ON FUNCTION public.bind_own_device_id(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bind_own_device_id(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bind_own_device_id(text) TO service_role;