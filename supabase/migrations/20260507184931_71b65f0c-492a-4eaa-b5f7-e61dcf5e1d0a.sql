CREATE OR REPLACE FUNCTION public.update_host_call_rate(p_rate integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  rates jsonb;
  min_r int;
  max_r int;
  min_lvl int;
  hl int;
  ul int;
  effective int;
  g text;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT gender::text, COALESCE(host_level, 0), COALESCE(user_level, 1)
    INTO g, hl, ul
  FROM profiles WHERE id = uid;
  IF g IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;
  IF lower(g) IS DISTINCT FROM 'female' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_female');
  END IF;

  SELECT setting_value::jsonb INTO rates
  FROM app_settings WHERE setting_key = 'call_rates' LIMIT 1;

  IF rates IS NULL OR rates = 'null'::jsonb THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_rates_not_configured');
  END IF;

  min_r := COALESCE(NULLIF((rates->>'min_rate')::int, 0), 0);
  max_r := COALESCE(NULLIF((rates->>'max_rate')::int, 0), 0);
  IF min_r <= 0 OR max_r <= min_r THEN
    RETURN jsonb_build_object('success', false, 'error', 'call_rates_min_max_invalid');
  END IF;

  IF p_rate < min_r OR p_rate > max_r THEN
    RETURN jsonb_build_object('success', false, 'error', 'rate_out_of_bounds');
  END IF;

  min_lvl := COALESCE((rates->>'min_level_for_custom_rate')::int, 6);
  effective := CASE WHEN hl > 0 THEN hl ELSE LEAST(99, GREATEST(1, ul)) END;
  IF effective < min_lvl THEN
    RETURN jsonb_build_object('success', false, 'error', 'level_too_low_for_custom_rate');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE profiles
  SET call_rate_per_minute = p_rate,
      updated_at = now()
  WHERE id = uid;

  RETURN jsonb_build_object('success', true, 'rate', p_rate);
END;
$$;

REVOKE ALL ON FUNCTION public.update_host_call_rate(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_host_call_rate(integer) TO authenticated;