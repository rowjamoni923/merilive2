
-- PART 0: Add primary key to parcel_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.parcel_templates'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public.parcel_templates ADD CONSTRAINT parcel_templates_pkey PRIMARY KEY (id);
  END IF;
END $$;

-- PART 1: Extend parcel_templates
ALTER TABLE public.parcel_templates
  ADD COLUMN IF NOT EXISTS parcel_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS reward_amount integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_label text,
  ADD COLUMN IF NOT EXISTS unlock_condition text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS unlock_threshold integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unlock_wait_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiry_hours integer NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS target_segment text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS min_level integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_level integer NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS glow_color text DEFAULT '#a855f7';

UPDATE public.parcel_templates
SET reward_amount = GREATEST(COALESCE(min_reward, 0), COALESCE(max_reward, 0))
WHERE reward_amount = 0;

-- PART 2: Extend user_parcels
ALTER TABLE public.user_parcels
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.parcel_templates(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS current_progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS required_progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_reward_type text,
  ADD COLUMN IF NOT EXISTS actual_reward_amount integer,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS unlocks_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz;

UPDATE public.user_parcels SET template_id = parcel_template_id WHERE template_id IS NULL AND parcel_template_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_active_parcel 
  ON public.user_parcels (user_id, template_id) 
  WHERE status IN ('locked', 'unlocked');

-- PART 3: DROP and recreate generate_user_parcels
DROP FUNCTION IF EXISTS public.generate_user_parcels(uuid);
CREATE FUNCTION public.generate_user_parcels(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_template RECORD;
  v_profile RECORD;
  v_existing INT;
  v_user_level INT;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT 
    COALESCE(level, 1) AS level,
    COALESCE(is_vip, false) AS is_vip,
    COALESCE(coins, 0) AS coins,
    created_at
  INTO v_profile FROM public.profiles WHERE id = p_user_id;

  IF NOT FOUND THEN RETURN; END IF;
  v_user_level := COALESCE(v_profile.level, 1);

  FOR v_template IN 
    SELECT * FROM public.parcel_templates WHERE is_active = true ORDER BY display_order
  LOOP
    SELECT COUNT(*) INTO v_existing 
    FROM public.user_parcels 
    WHERE user_id = p_user_id AND template_id = v_template.id AND status IN ('locked', 'unlocked');
    IF v_existing > 0 THEN CONTINUE; END IF;

    IF v_template.target_segment = 'new_user' AND v_profile.created_at < now() - interval '7 days' THEN CONTINUE; END IF;
    IF v_template.target_segment = 'vip' AND NOT v_profile.is_vip THEN CONTINUE; END IF;
    IF v_template.min_level > v_user_level OR v_template.max_level < v_user_level THEN CONTINUE; END IF;

    INSERT INTO public.user_parcels (
      user_id, template_id, parcel_template_id, status,
      required_progress, current_progress,
      actual_reward_type, actual_reward_amount,
      coins_amount, parcel_type,
      assigned_at, unlocks_at, expires_at
    )
    VALUES (
      p_user_id, v_template.id, v_template.id,
      CASE WHEN v_template.unlock_condition = 'none' AND v_template.unlock_wait_hours = 0 
           THEN 'unlocked' ELSE 'locked' END,
      v_template.unlock_threshold, 0,
      v_template.reward_type, v_template.reward_amount,
      CASE WHEN v_template.reward_type = 'coins' THEN v_template.reward_amount ELSE 0 END,
      v_template.parcel_type,
      now(),
      CASE WHEN v_template.unlock_wait_hours > 0 
           THEN now() + (v_template.unlock_wait_hours || ' hours')::interval ELSE NULL END,
      CASE WHEN v_template.expiry_hours > 0 
           THEN now() + (v_template.expiry_hours || ' hours')::interval ELSE NULL END
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- PART 4: DROP and recreate claim_parcel_reward
DROP FUNCTION IF EXISTS public.claim_parcel_reward(uuid);
CREATE FUNCTION public.claim_parcel_reward(p_parcel_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _parcel RECORD;
  _template RECORD;
  _reward_type text;
  _reward_amount integer;
  _parcel_name text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _parcel FROM public.user_parcels 
  WHERE id = p_parcel_id AND user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel not found');
  END IF;

  IF _parcel.status NOT IN ('unlocked') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Parcel not ready (' || _parcel.status || ')');
  END IF;

  IF _parcel.expires_at IS NOT NULL AND _parcel.expires_at < now() THEN
    UPDATE public.user_parcels SET status = 'expired' WHERE id = p_parcel_id;
    RETURN jsonb_build_object('success', false, 'error', 'Parcel expired');
  END IF;

  _reward_type := _parcel.actual_reward_type;
  _reward_amount := _parcel.actual_reward_amount;

  SELECT name, reward_type, reward_amount INTO _template
  FROM public.parcel_templates WHERE id = _parcel.template_id;

  _parcel_name := COALESCE(_template.name, 'Gift Parcel');
  IF _reward_type IS NULL OR _reward_amount IS NULL OR _reward_amount = 0 THEN
    _reward_type := COALESCE(_reward_type, _template.reward_type, 'coins');
    _reward_amount := COALESCE(NULLIF(_reward_amount, 0), _template.reward_amount, 0);
  END IF;

  IF _reward_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No reward configured');
  END IF;

  UPDATE public.user_parcels 
  SET status = 'opened', opened_at = now(), claimed_at = now(),
      actual_reward_type = _reward_type, actual_reward_amount = _reward_amount
  WHERE id = p_parcel_id;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF _reward_type = 'coins' THEN
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + _reward_amount WHERE id = _user_id;
  ELSIF _reward_type = 'diamonds' THEN
    UPDATE public.profiles SET diamonds = COALESCE(diamonds, 0) + _reward_amount WHERE id = _user_id;
  ELSIF _reward_type = 'beans' THEN
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + _reward_amount WHERE id = _user_id;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'reward_type', _reward_type,
    'reward_amount', _reward_amount,
    'parcel_name', _parcel_name
  );
END;
$$;

-- PART 5: Realtime
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_parcels;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.user_parcels REPLICA IDENTITY FULL;
