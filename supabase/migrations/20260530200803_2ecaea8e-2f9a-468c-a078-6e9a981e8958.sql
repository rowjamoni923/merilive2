CREATE OR REPLACE FUNCTION public.submit_rating_proof(_screenshot_url text, _platform text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile RECORD;
  v_amount_setting jsonb;
  v_host_beans int;
  v_user_diamonds int;
  v_reward_type text;
  v_reward_amount int;
  v_existing RECORD;
  v_platform text;
  v_url text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;

  v_url := trim(coalesce(_screenshot_url, ''));
  IF length(v_url) < 8 OR length(v_url) > 2000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_url');
  END IF;

  v_platform := lower(coalesce(nullif(trim(_platform), ''), 'web'));
  IF v_platform NOT IN ('web', 'android', 'ios') THEN
    v_platform := 'web';
  END IF;

  -- Block if there's already a pending or approved claim
  SELECT status INTO v_existing
  FROM public.rating_reward_claims
  WHERE user_id = v_uid
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND AND v_existing.status IN ('pending','approved') THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_submitted', 'status', v_existing.status);
  END IF;

  -- Load reward amounts from settings
  SELECT setting_value INTO v_amount_setting
  FROM public.app_settings
  WHERE setting_key = 'rating_reward_amounts'
  LIMIT 1;

  BEGIN
    v_host_beans := nullif((v_amount_setting->>'host_beans'),'')::int;
    v_user_diamonds := nullif((v_amount_setting->>'user_diamonds'),'')::int;
  EXCEPTION WHEN others THEN
    v_host_beans := NULL;
    v_user_diamonds := NULL;
  END;

  -- Default values if not set
  IF v_host_beans IS NULL OR v_host_beans <= 0 THEN v_host_beans := 10000; END IF;
  IF v_user_diamonds IS NULL OR v_user_diamonds <= 0 THEN v_user_diamonds := 10000; END IF;

  SELECT is_host, is_banned, is_deleted
  INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND OR coalesce(v_profile.is_banned,false) OR coalesce(v_profile.is_deleted,false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_unavailable');
  END IF;

  -- Updated Logic: Host -> Beans, User -> Diamonds
  IF coalesce(v_profile.is_host,false) = true THEN
    v_reward_type := 'beans';
    v_reward_amount := v_host_beans;
  ELSE
    v_reward_type := 'diamonds';
    v_reward_amount := v_user_diamonds;
  END IF;

  INSERT INTO public.rating_reward_claims (
    user_id, screenshot_url, platform,
    reward_type, reward_amount, reward_coins,
    status, claimed_at
  ) VALUES (
    v_uid, v_url, v_platform,
    v_reward_type, v_reward_amount, v_reward_amount,
    'pending', NOW()
  );

  RETURN jsonb_build_object('success', true, 'reward_type', v_reward_type, 'reward_amount', v_reward_amount);
END;
$function$;
