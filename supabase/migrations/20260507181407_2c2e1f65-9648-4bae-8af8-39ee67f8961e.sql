
-- Section 01: profile_follow_stats(uid) → friends/following/followers counts (web parity)
CREATE OR REPLACE FUNCTION public.profile_follow_stats(uid uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_followers AS (
    SELECT follower_id FROM public.followers WHERE following_id = uid
  ),
  my_following AS (
    SELECT following_id FROM public.followers WHERE follower_id = uid
  )
  SELECT jsonb_build_object(
    'friends',   (SELECT COUNT(*)::bigint FROM my_followers f INNER JOIN my_following g ON f.follower_id = g.following_id),
    'following', (SELECT COUNT(*)::bigint FROM my_following),
    'followers', (SELECT COUNT(*)::bigint FROM my_followers)
  );
$$;

REVOKE ALL ON FUNCTION public.profile_follow_stats(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profile_follow_stats(uuid) TO authenticated;

-- Section 02: recharge_packages = read alias of coin_packages (Flutter app parity)
CREATE OR REPLACE VIEW public.recharge_packages AS
SELECT * FROM public.coin_packages;

GRANT SELECT ON public.recharge_packages TO anon, authenticated;

-- Section 03: process_user_beans_exchange — atomic beans→diamonds via app_settings.coin_exchange
CREATE OR REPLACE FUNCTION public.process_user_beans_exchange(p_amount integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_text text;
  v_json jsonb;
  v_rate numeric;
  v_fee  numeric;
  v_min  integer;
  v_fee_beans integer;
  v_after integer;
  v_dmd integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  IF p_amount IS NULL OR p_amount < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Invalid amount');
  END IF;

  SELECT setting_value INTO v_text
  FROM app_settings
  WHERE setting_key = 'coin_exchange'
  LIMIT 1;

  IF v_text IS NULL OR btrim(v_text) = '' THEN
    RETURN json_build_object('success', false, 'error', 'Exchange settings are not configured');
  END IF;

  BEGIN
    v_json := v_text::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', 'Exchange settings are invalid');
  END;

  v_rate := COALESCE((v_json->>'beans_to_diamonds_rate')::numeric, 0);
  v_fee  := COALESCE((v_json->>'exchange_fee_percent')::numeric, 0);
  v_min  := COALESCE((v_json->>'min_exchange_amount')::integer, 0);

  IF v_rate <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'Exchange rate is not configured');
  END IF;
  IF v_min > 0 AND p_amount < v_min THEN
    RETURN json_build_object('success', false, 'error', format('Minimum exchange is %s beans', v_min));
  END IF;

  v_fee_beans := floor(p_amount * v_fee / 100.0)::integer;
  v_after     := p_amount - v_fee_beans;
  v_dmd       := floor(v_after / v_rate)::integer;

  IF v_dmd < 1 THEN
    RETURN json_build_object('success', false, 'error', 'Amount too small for any diamonds');
  END IF;

  RETURN public.exchange_user_beans_to_diamonds(v_user, p_amount, v_dmd, NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_user_beans_exchange(integer) TO authenticated;
