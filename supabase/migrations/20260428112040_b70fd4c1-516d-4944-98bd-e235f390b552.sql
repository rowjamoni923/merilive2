
-- ============================================================
-- PHASE 2: VIP & NOBLE SYSTEM — ATOMIC RPC FUNCTIONS
-- ============================================================

-- ----- 1. Purchase Noble Card -----
CREATE OR REPLACE FUNCTION public.purchase_noble_card(
  _noble_card_id UUID,
  _auto_renew BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _card RECORD;
  _current_balance INTEGER;
  _existing RECORD;
  _new_expires TIMESTAMPTZ;
  _subscription_id UUID;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Lock card row
  SELECT * INTO _card FROM public.noble_cards
  WHERE id = _noble_card_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Noble card not found or inactive');
  END IF;

  -- Lock user balance
  SELECT diamonds INTO _current_balance FROM public.profiles
  WHERE id = _user_id FOR UPDATE;

  IF _current_balance IS NULL OR _current_balance < _card.monthly_diamond_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Insufficient diamonds',
      'required', _card.monthly_diamond_cost,
      'current', COALESCE(_current_balance, 0)
    );
  END IF;

  -- Check for existing active subscription on same card → extend
  SELECT * INTO _existing FROM public.user_noble_subscriptions
  WHERE user_id = _user_id
    AND noble_card_id = _noble_card_id
    AND is_active = true
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1
  FOR UPDATE;

  -- Deduct diamonds
  UPDATE public.profiles
  SET diamonds = diamonds - _card.monthly_diamond_cost,
      updated_at = now()
  WHERE id = _user_id;

  IF _existing.id IS NOT NULL THEN
    -- Extend existing
    _new_expires := _existing.expires_at + (_card.duration_days || ' days')::INTERVAL;
    UPDATE public.user_noble_subscriptions
    SET expires_at = _new_expires,
        diamonds_spent = diamonds_spent + _card.monthly_diamond_cost,
        auto_renew = _auto_renew,
        updated_at = now()
    WHERE id = _existing.id
    RETURNING id INTO _subscription_id;
  ELSE
    -- Deactivate any other active subscriptions (only one noble at a time)
    UPDATE public.user_noble_subscriptions
    SET is_active = false, updated_at = now()
    WHERE user_id = _user_id AND is_active = true;

    -- Create new
    _new_expires := now() + (_card.duration_days || ' days')::INTERVAL;
    INSERT INTO public.user_noble_subscriptions (
      user_id, noble_card_id, started_at, expires_at,
      is_active, auto_renew, diamonds_spent
    ) VALUES (
      _user_id, _noble_card_id, now(), _new_expires,
      true, _auto_renew, _card.monthly_diamond_cost
    ) RETURNING id INTO _subscription_id;
  END IF;

  -- Auto-credit monthly free diamonds (one-shot bonus on purchase)
  IF _card.monthly_free_diamonds > 0 THEN
    UPDATE public.profiles
    SET diamonds = diamonds + _card.monthly_free_diamonds,
        updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'subscription_id', _subscription_id,
    'rank_code', _card.rank_code,
    'rank_name', _card.rank_name,
    'expires_at', _new_expires,
    'diamonds_spent', _card.monthly_diamond_cost,
    'free_diamonds_credited', _card.monthly_free_diamonds
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_noble_card(UUID, BOOLEAN) TO authenticated;

-- ----- 2. Claim Daily VIP Reward -----
CREATE OR REPLACE FUNCTION public.claim_vip_daily_reward()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id UUID := auth.uid();
  _today DATE := CURRENT_DATE;
  _vip_tier RECORD;
  _noble_card RECORD;
  _vip_diamonds INTEGER := 0;
  _noble_diamonds INTEGER := 0;
  _total INTEGER := 0;
  _claimed_sources TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Active VIP tier reward (highest tier the user owns via user_vip_subscriptions)
  SELECT vt.id, vt.daily_free_diamonds, vt.tier_name INTO _vip_tier
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
    AND vt.daily_free_diamonds > 0
  ORDER BY vt.tier_level DESC
  LIMIT 1;

  IF _vip_tier.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vip_daily_rewards_log (user_id, claim_date, source_type, source_id, diamonds_awarded)
      VALUES (_user_id, _today, 'vip_tier', _vip_tier.id, _vip_tier.daily_free_diamonds);
      _vip_diamonds := _vip_tier.daily_free_diamonds;
      _claimed_sources := array_append(_claimed_sources, 'vip_tier:' || _vip_tier.tier_name);
    EXCEPTION WHEN unique_violation THEN
      -- already claimed today
      _vip_diamonds := 0;
    END;
  END IF;

  -- Active Noble card reward
  SELECT nc.id, nc.daily_free_diamonds, nc.rank_name INTO _noble_card
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.daily_free_diamonds > 0
  ORDER BY nc.rank_order DESC
  LIMIT 1;

  IF _noble_card.id IS NOT NULL THEN
    BEGIN
      INSERT INTO public.vip_daily_rewards_log (user_id, claim_date, source_type, source_id, diamonds_awarded)
      VALUES (_user_id, _today, 'noble_card', _noble_card.id, _noble_card.daily_free_diamonds);
      _noble_diamonds := _noble_card.daily_free_diamonds;
      _claimed_sources := array_append(_claimed_sources, 'noble_card:' || _noble_card.rank_name);
    EXCEPTION WHEN unique_violation THEN
      _noble_diamonds := 0;
    END;
  END IF;

  _total := _vip_diamonds + _noble_diamonds;

  IF _total > 0 THEN
    UPDATE public.profiles
    SET diamonds = diamonds + _total, updated_at = now()
    WHERE id = _user_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'total_diamonds_awarded', _total,
    'vip_diamonds', _vip_diamonds,
    'noble_diamonds', _noble_diamonds,
    'sources', _claimed_sources,
    'already_claimed', (_vip_tier.id IS NOT NULL OR _noble_card.id IS NOT NULL) AND _total = 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_vip_daily_reward() TO authenticated;

-- ----- 3. Apply Recharge Bonus (called from recharge edge functions / triggers) -----
CREATE OR REPLACE FUNCTION public.apply_vip_recharge_bonus(
  _user_id UUID,
  _recharge_id UUID,
  _base_diamonds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _vip_pct NUMERIC := 0;
  _noble_pct NUMERIC := 0;
  _final_pct NUMERIC := 0;
  _bonus INTEGER := 0;
  _vip_id UUID;
  _noble_id UUID;
  _source_type TEXT;
  _source_id UUID;
BEGIN
  IF _base_diamonds IS NULL OR _base_diamonds <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid base diamonds');
  END IF;

  -- Get highest active VIP tier bonus
  SELECT vt.id, vt.recharge_bonus_percent INTO _vip_id, _vip_pct
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now())
    AND vt.recharge_bonus_percent > 0
  ORDER BY vt.recharge_bonus_percent DESC
  LIMIT 1;

  -- Get active Noble bonus
  SELECT nc.id, nc.recharge_bonus_percent INTO _noble_id, _noble_pct
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.recharge_bonus_percent > 0
  ORDER BY nc.recharge_bonus_percent DESC
  LIMIT 1;

  -- Use the higher
  IF COALESCE(_noble_pct, 0) >= COALESCE(_vip_pct, 0) THEN
    _final_pct := COALESCE(_noble_pct, 0);
    _source_type := 'noble_card';
    _source_id := _noble_id;
  ELSE
    _final_pct := COALESCE(_vip_pct, 0);
    _source_type := 'vip_tier';
    _source_id := _vip_id;
  END IF;

  IF _final_pct <= 0 THEN
    RETURN jsonb_build_object('success', true, 'bonus_diamonds', 0, 'reason', 'No bonus eligible');
  END IF;

  _bonus := FLOOR(_base_diamonds * _final_pct / 100.0);

  IF _bonus > 0 THEN
    UPDATE public.profiles
    SET diamonds = diamonds + _bonus, updated_at = now()
    WHERE id = _user_id;

    INSERT INTO public.vip_recharge_bonus_log (
      user_id, recharge_id, base_diamonds, bonus_percent,
      bonus_diamonds, source_type, source_id
    ) VALUES (
      _user_id, _recharge_id, _base_diamonds, _final_pct,
      _bonus, _source_type, _source_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bonus_diamonds', _bonus,
    'bonus_percent', _final_pct,
    'source_type', _source_type
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_vip_recharge_bonus(UUID, UUID, INTEGER) TO service_role;

-- ----- 4. Anti-Kick Check (called from live room moderation) -----
CREATE OR REPLACE FUNCTION public.check_user_anti_kick(
  _target_user_id UUID,
  _moderator_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_vip_level INTEGER := 0;
  _target_noble_order INTEGER := 0;
  _target_anti_kick BOOLEAN := false;
  _moderator_vip_level INTEGER := 0;
  _moderator_noble_order INTEGER := 0;
BEGIN
  -- Target's protections
  SELECT MAX(vt.tier_level), bool_or(vt.anti_kick_protection)
  INTO _target_vip_level, _target_anti_kick
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _target_user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now());

  SELECT MAX(nc.rank_order)
  INTO _target_noble_order
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _target_user_id
    AND uns.is_active = true
    AND uns.expires_at > now()
    AND nc.anti_kick_protection = true;

  -- If neither, no protection
  IF NOT COALESCE(_target_anti_kick, false) AND COALESCE(_target_noble_order, 0) = 0 THEN
    RETURN jsonb_build_object('protected', false);
  END IF;

  -- Moderator's authority
  SELECT MAX(vt.tier_level) INTO _moderator_vip_level
  FROM public.user_vip_subscriptions uvs
  JOIN public.vip_tiers vt ON vt.id = uvs.vip_tier_id
  WHERE uvs.user_id = _moderator_user_id
    AND uvs.is_active = true
    AND (uvs.expires_at IS NULL OR uvs.expires_at > now());

  SELECT MAX(nc.rank_order) INTO _moderator_noble_order
  FROM public.user_noble_subscriptions uns
  JOIN public.noble_cards nc ON nc.id = uns.noble_card_id
  WHERE uns.user_id = _moderator_user_id
    AND uns.is_active = true
    AND uns.expires_at > now();

  -- Moderator must have STRICTLY higher rank in either dimension
  IF COALESCE(_moderator_noble_order, 0) > COALESCE(_target_noble_order, 0)
     OR COALESCE(_moderator_vip_level, 0) > COALESCE(_target_vip_level, 0) THEN
    RETURN jsonb_build_object('protected', false, 'reason', 'Moderator outranks target');
  END IF;

  RETURN jsonb_build_object(
    'protected', true,
    'target_vip_level', _target_vip_level,
    'target_noble_order', _target_noble_order,
    'reason', 'Target has higher or equal VIP/Noble rank'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_anti_kick(UUID, UUID) TO authenticated;

-- ----- 5. Send noble expiration reminders (returns batch of users to notify) -----
CREATE OR REPLACE FUNCTION public.get_noble_subscriptions_needing_reminder()
RETURNS TABLE (
  subscription_id UUID,
  user_id UUID,
  rank_name TEXT,
  expires_at TIMESTAMPTZ,
  days_remaining INTEGER,
  reminder_type TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active AS (
    SELECT
      s.id, s.user_id, nc.rank_name, s.expires_at,
      EXTRACT(DAY FROM (s.expires_at - now()))::INTEGER AS days_left,
      s.reminders_sent
    FROM public.user_noble_subscriptions s
    JOIN public.noble_cards nc ON nc.id = s.noble_card_id
    WHERE s.is_active = true
      AND s.expires_at > now()
      AND s.expires_at <= now() + INTERVAL '8 days'
  )
  SELECT
    a.id, a.user_id, a.rank_name, a.expires_at, a.days_left,
    CASE
      WHEN a.days_left <= 1 AND NOT (a.reminders_sent ? '1') THEN '1'
      WHEN a.days_left <= 3 AND NOT (a.reminders_sent ? '3') THEN '3'
      WHEN a.days_left <= 7 AND NOT (a.reminders_sent ? '7') THEN '7'
      ELSE NULL
    END AS reminder_type
  FROM active a
  WHERE
    (a.days_left <= 1 AND NOT (a.reminders_sent ? '1'))
    OR (a.days_left <= 3 AND NOT (a.reminders_sent ? '3'))
    OR (a.days_left <= 7 AND NOT (a.reminders_sent ? '7'));
$$;

-- ----- 6. Mark reminder as sent -----
CREATE OR REPLACE FUNCTION public.mark_noble_reminder_sent(_subscription_id UUID, _reminder_type TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_noble_subscriptions
  SET reminders_sent = reminders_sent || jsonb_build_array(_reminder_type),
      last_reminder_sent_at = now(),
      updated_at = now()
  WHERE id = _subscription_id;
END;
$$;
