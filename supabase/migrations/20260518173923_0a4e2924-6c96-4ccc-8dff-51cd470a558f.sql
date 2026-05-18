
-- Seed admin-controlled rating reward amounts (current behavior preserved, now editable)
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'rating_reward_amounts',
  '{"host_beans": 10000, "user_diamonds": 5000}',
  'Play Store rating reward amounts. host_beans = beans credited to female (host) users, user_diamonds = diamonds credited to all other users.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- Rewrite approve_rating_reward to read amounts from app_settings only (no defaults)
CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claim   RECORD;
  v_gender  text;
  v_amount  bigint;
  v_type    text;
  v_cfg     jsonb;
  v_host_beans     bigint;
  v_user_diamonds  bigint;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Read admin-configured reward amounts; fail loud if missing
  SELECT
    CASE
      WHEN jsonb_typeof(setting_value::jsonb) = 'object' THEN setting_value::jsonb
      ELSE NULL
    END
  INTO v_cfg
  FROM public.app_settings
  WHERE setting_key = 'rating_reward_amounts';

  IF v_cfg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'rating_reward_amounts not configured in admin settings');
  END IF;

  v_host_beans    := NULLIF((v_cfg->>'host_beans'), '')::bigint;
  v_user_diamonds := NULLIF((v_cfg->>'user_diamonds'), '')::bigint;

  IF v_host_beans IS NULL OR v_host_beans <= 0
     OR v_user_diamonds IS NULL OR v_user_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'rating_reward_amounts invalid — set host_beans and user_diamonds in admin settings');
  END IF;

  SELECT * INTO v_claim FROM public.rating_reward_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found');
  END IF;
  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  SELECT lower(coalesce(gender, '')) INTO v_gender
  FROM public.profiles WHERE id = v_claim.user_id;

  IF v_gender = 'female' THEN
    v_amount := v_host_beans;
    v_type   := 'beans';
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + v_amount WHERE id = v_claim.user_id;
  ELSE
    v_amount := v_user_diamonds;
    v_type   := 'diamonds';
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + v_amount WHERE id = v_claim.user_id;
  END IF;

  UPDATE public.rating_reward_claims
     SET status        = 'approved',
         reviewed_by   = p_admin_id,
         reviewed_at   = now(),
         reward_type   = v_type,
         reward_amount = v_amount
   WHERE id = p_claim_id;

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'reward_type', v_type,
    'reward_amount', v_amount
  );
END;
$function$;
