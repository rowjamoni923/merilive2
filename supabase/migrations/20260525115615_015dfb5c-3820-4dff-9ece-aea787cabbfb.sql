CREATE OR REPLACE FUNCTION public.update_host_call_rate(p_rate integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rates jsonb;
  min_r numeric;
  max_r numeric;
  min_lvl int;
  host_rec record;
  level_rates jsonb;
  is_level_rate boolean := false;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  IF p_rate IS NULL OR p_rate <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_rate');
  END IF;

  SELECT id, gender, is_host, host_status, is_face_verified, COALESCE(host_level, 0) AS host_level
    INTO host_rec
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;

  IF host_rec.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF COALESCE(host_rec.is_host, false) IS NOT TRUE
     OR lower(COALESCE(host_rec.gender::text, '')) <> 'female'
     OR lower(COALESCE(host_rec.host_status, '')) <> 'approved'
     OR COALESCE(host_rec.is_face_verified, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'only_approved_hosts_can_set_call_price');
  END IF;

  SELECT setting_value::jsonb INTO rates
  FROM public.app_settings
  WHERE setting_key = 'call_rates'
  LIMIT 1;

  IF rates IS NULL OR rates = 'null'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_rates_not_configured');
  END IF;

  level_rates := COALESCE(rates->'level_rates', '[]'::jsonb);

  SELECT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(level_rates) lr
    WHERE (lr->>'rate')::numeric = p_rate
  ) INTO is_level_rate;

  IF NOT is_level_rate THEN
    BEGIN
      min_r := COALESCE(NULLIF((rates->>'min_rate')::numeric, 0), 30);
      max_r := COALESCE(NULLIF((rates->>'max_rate')::numeric, 0), 100000);
      min_lvl := COALESCE((rates->>'min_level_for_custom_rate')::int, 6);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', 'call_rates_invalid');
    END;

    IF p_rate < min_r OR p_rate > max_r THEN
      RETURN jsonb_build_object('success', false, 'error', 'rate_out_of_bounds', 'min_rate', min_r, 'max_rate', max_r);
    END IF;

    IF COALESCE(host_rec.host_level, 0) < min_lvl THEN
      RETURN jsonb_build_object('success', false, 'error', 'level_too_low_for_custom_rate', 'min_level', min_lvl, 'host_level', COALESCE(host_rec.host_level, 0));
    END IF;
  END IF;

  UPDATE public.profiles
  SET call_rate_per_minute = p_rate,
      updated_at = now()
  WHERE id = uid;

  RETURN jsonb_build_object('success', true, 'rate', p_rate, 'is_level_rate', is_level_rate);
END;
$$;

REVOKE ALL ON FUNCTION public.update_host_call_rate(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_host_call_rate(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_host_call_rate(integer) TO authenticated;