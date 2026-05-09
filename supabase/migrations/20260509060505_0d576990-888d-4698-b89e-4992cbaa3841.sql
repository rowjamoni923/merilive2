-- Game RPCs use profiles.coins
CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id uuid, p_amount integer, p_game_id text, p_game_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur bigint; v_new bigint; v_amt bigint; v_label text;
BEGIN
  v_amt := GREATEST(0, p_amount::bigint);
  IF v_amt <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid bet amount'); END IF;
  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < v_amt THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds', 'balance', v_cur, 'current_balance', v_cur); END IF;
  v_new := v_cur - v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, v_label, 'bet', v_amt, v_cur, v_new);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'deducted', v_amt);
END; $$;

CREATE OR REPLACE FUNCTION public.place_game_bet(
  p_user_id uuid, p_bet_amount integer, p_game_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.place_game_bet(p_user_id, p_bet_amount,
    COALESCE(NULLIF(trim(p_game_type), ''), 'game'),
    COALESCE(NULLIF(trim(p_game_type), ''), 'game'));
END; $$;

CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id uuid, p_amount bigint, p_game_id text, p_game_name text,
  p_multiplier numeric DEFAULT NULL, p_is_jackpot boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur bigint; v_new bigint; v_amt bigint; v_label text;
BEGIN
  v_amt := GREATEST(0, p_amount);
  IF v_amt <= 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid win amount'); END IF;
  v_label := NULLIF(trim(COALESCE(p_game_name, '')), '');
  IF v_label IS NULL THEN v_label := NULLIF(trim(COALESCE(p_game_id, '')), ''); END IF;
  IF v_label IS NULL THEN v_label := 'unknown'; END IF;
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  v_new := v_cur + v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.game_transactions (user_id, game_type, transaction_type, amount, balance_before, balance_after)
  VALUES (p_user_id, v_label, 'win', v_amt, v_cur, v_new);
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new, 'added', v_amt);
END; $$;

CREATE OR REPLACE FUNCTION public.process_game_win(
  p_user_id uuid, p_amount bigint, p_game_type text DEFAULT 'unknown'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.process_game_win(p_user_id, p_amount,
    COALESCE(NULLIF(trim(p_game_type), ''), 'unknown'),
    COALESCE(NULLIF(trim(p_game_type), ''), 'unknown'), NULL, false);
END; $$;

CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id uuid, p_amount integer, p_reason text DEFAULT 'deduction'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cur bigint; v_new bigint; v_amt bigint;
BEGIN
  v_amt := GREATEST(0, p_amount::bigint);
  SELECT coins INTO v_cur FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_cur IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;
  IF v_cur < v_amt THEN RETURN jsonb_build_object('success', false, 'error', 'Insufficient balance', 'balance', v_cur); END IF;
  v_new := v_cur - v_amt;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles SET coins = v_new, updated_at = now() WHERE id = p_user_id;
  RETURN jsonb_build_object('success', true, 'new_balance', v_new, 'balance', v_new);
END; $$;

CREATE OR REPLACE FUNCTION public.deduct_coins_atomic(
  p_user_id uuid, p_amount integer
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.deduct_coins_atomic(p_user_id, p_amount, 'deduction');
$$;

GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, integer, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.place_game_bet(uuid, integer, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text, text, numeric, boolean) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.process_game_win(uuid, bigint, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_coins_atomic(uuid, integer, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_coins_atomic(uuid, integer) TO authenticated, anon, service_role;

-- Penalty tiers live in violation_penalties
ALTER TABLE public.violation_penalties
  ADD CONSTRAINT violation_penalties_violation_number_key UNIQUE (violation_number);

INSERT INTO public.violation_penalties (violation_number, penalty_type, beans_amount, description) VALUES
  (7, 'beans_deduction', 150000, '7th Warning'),
  (8, 'beans_deduction', 200000, '8th Warning'),
  (9, 'beans_deduction', 300000, '9th Warning'),
  (10, 'account_ban', 0, '10th Violation — permanent ban')
ON CONFLICT (violation_number) DO UPDATE SET
  penalty_type = EXCLUDED.penalty_type,
  beans_amount = EXCLUDED.beans_amount,
  description = EXCLUDED.description,
  is_active = true;

UPDATE public.violation_penalties
SET penalty_type = 'beans_deduction', beans_amount = 120000,
    description = '6th Warning — 120,000 beans / diamonds tier', is_active = true
WHERE violation_number = 6;

CREATE TABLE IF NOT EXISTS public.user_contact_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  violation_number integer NOT NULL,
  violation_type text NOT NULL DEFAULT 'contact_sharing',
  detected_content text,
  detected_pattern text,
  source_type text,
  source_id text,
  coins_deducted integer NOT NULL DEFAULT 0,
  is_auto_detected boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_contact_violations_user_id ON public.user_contact_violations(user_id);
ALTER TABLE public.user_contact_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own contact violations" ON public.user_contact_violations;
CREATE POLICY "Users read own contact violations"
  ON public.user_contact_violations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.process_contact_violation(
  p_host_id uuid, p_detected_content text, p_detected_pattern text,
  p_source_type text, p_source_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_host boolean; v_violation_count integer; v_new_violation_number integer;
  v_penalty record; v_beans_deducted integer := 0; v_coins_deducted integer := 0;
  v_is_banned boolean := false; v_result jsonb; v_latest_violation_id uuid;
  v_safe_source_id uuid := NULL; v_current_earnings numeric; v_coin_bal bigint;
  v_tier_cap integer := 10; v_notes text;
BEGIN
  IF p_source_id IS NOT NULL AND p_source_id != '' THEN
    BEGIN v_safe_source_id := p_source_id::uuid;
    EXCEPTION WHEN OTHERS THEN v_safe_source_id := NULL; END;
  END IF;

  SELECT COALESCE(is_host, false) INTO v_is_host FROM public.profiles WHERE id = p_host_id;

  IF v_is_host THEN
    SELECT COUNT(*) INTO v_violation_count FROM public.host_contact_violations WHERE host_id = p_host_id;
  ELSE
    SELECT COUNT(*) INTO v_violation_count FROM public.user_contact_violations WHERE user_id = p_host_id;
  END IF;

  v_new_violation_number := v_violation_count + 1;

  SELECT * INTO v_penalty FROM public.violation_penalties
  WHERE violation_number = LEAST(v_new_violation_number, v_tier_cap) AND is_active = true;

  IF v_penalty IS NULL THEN
    SELECT * INTO v_penalty FROM public.violation_penalties
    WHERE violation_number = v_tier_cap AND is_active = true;
  END IF;

  IF v_is_host THEN
    SELECT COALESCE(weekly_earnings, 0) INTO v_current_earnings FROM public.profiles WHERE id = p_host_id;
    IF v_penalty IS NOT NULL AND v_penalty.penalty_type = 'account_ban' THEN
      UPDATE public.profiles SET is_blocked = true,
        blocked_reason = 'Auto-banned: contact sharing violations (tier 10)', blocked_at = now()
      WHERE id = p_host_id;
      v_is_banned := true; v_beans_deducted := 0;
    ELSIF v_penalty IS NOT NULL THEN
      v_beans_deducted := v_penalty.beans_amount;
      UPDATE public.profiles SET weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
        beans = COALESCE(beans, 0) - v_beans_deducted WHERE id = p_host_id;
    ELSE
      v_beans_deducted := 2000;
      UPDATE public.profiles SET weekly_earnings = COALESCE(weekly_earnings, 0) - v_beans_deducted,
        beans = COALESCE(beans, 0) - v_beans_deducted WHERE id = p_host_id;
    END IF;

    INSERT INTO public.host_contact_violations (
      host_id, violation_number, violation_type, detected_content,
      detected_pattern, source_type, source_id, beans_deducted, is_auto_detected
    ) VALUES (
      p_host_id, v_new_violation_number, 'contact_sharing', p_detected_content,
      p_detected_pattern, p_source_type, p_source_id, v_beans_deducted, true
    ) RETURNING id INTO v_latest_violation_id;

    v_notes := format('Violation #%s (host) | beans=%s | weekly_earnings_before=%s',
      v_new_violation_number, v_beans_deducted, v_current_earnings);
  ELSE
    SELECT coins INTO v_coin_bal FROM public.profiles WHERE id = p_host_id FOR UPDATE;
    IF v_coin_bal IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'User not found'); END IF;

    IF v_penalty IS NOT NULL AND v_penalty.penalty_type = 'account_ban' THEN
      UPDATE public.profiles SET is_blocked = true,
        blocked_reason = 'Auto-banned: contact sharing violations (tier 10)', blocked_at = now()
      WHERE id = p_host_id;
      v_is_banned := true; v_coins_deducted := 0;
    ELSIF v_penalty IS NOT NULL THEN
      v_coins_deducted := LEAST(v_penalty.beans_amount::bigint, v_coin_bal)::integer;
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles SET coins = v_coin_bal - v_coins_deducted,
        total_consumption = COALESCE(total_consumption, 0) + v_coins_deducted, updated_at = now()
      WHERE id = p_host_id;
    ELSE
      v_coins_deducted := LEAST(2000::bigint, v_coin_bal)::integer;
      PERFORM set_config('app.bypass_profile_protection', 'true', true);
      UPDATE public.profiles SET coins = v_coin_bal - v_coins_deducted,
        total_consumption = COALESCE(total_consumption, 0) + v_coins_deducted, updated_at = now()
      WHERE id = p_host_id;
    END IF;

    INSERT INTO public.user_contact_violations (
      user_id, violation_number, violation_type, detected_content,
      detected_pattern, source_type, source_id, coins_deducted, is_auto_detected
    ) VALUES (
      p_host_id, v_new_violation_number, 'contact_sharing', p_detected_content,
      p_detected_pattern, p_source_type, p_source_id, v_coins_deducted, true
    ) RETURNING id INTO v_latest_violation_id;

    v_notes := format('Violation #%s (user) | coins_deducted=%s | balance_before=%s',
      v_new_violation_number, v_coins_deducted, v_coin_bal);
  END IF;

  INSERT INTO public.chat_moderation_logs (
    user_id, violation_type, detected_content, conversation_id,
    action_taken, is_auto_action, notes
  ) VALUES (
    p_host_id, p_detected_pattern, p_detected_content, v_safe_source_id,
    CASE WHEN v_is_banned THEN 'account_banned'
      WHEN v_is_host THEN 'beans_deducted_' || v_beans_deducted::text
      ELSE 'coins_deducted_' || v_coins_deducted::text
    END, true, COALESCE(v_notes, format('Violation #%s', v_new_violation_number))
  );

  v_result := jsonb_build_object(
    'success', true, 'violation_id', v_latest_violation_id,
    'violation_number', v_new_violation_number,
    'beans_deducted', v_beans_deducted, 'coins_deducted', v_coins_deducted,
    'is_banned', v_is_banned
  );
  RETURN v_result;
END; $$;

GRANT EXECUTE ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.process_face_verification_v3(
  p_user_id uuid, p_is_match boolean, p_confidence numeric,
  p_face_rekognition_id text, p_profile_photo_url text,
  p_live_face_url text DEFAULT NULL, p_duplicate_user_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _submission_id uuid; _result jsonb; _dup_is_guard_host boolean;
BEGIN
  IF p_duplicate_user_id IS NOT NULL AND p_duplicate_user_id <> p_user_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles d
      WHERE d.id = p_duplicate_user_id AND d.is_host = true
        AND lower(coalesce(d.host_status::text, '')) = 'approved'
        AND coalesce(d.is_face_verified, false) = true
    ) INTO _dup_is_guard_host;

    IF _dup_is_guard_host THEN
      PERFORM public.ban_duplicate_face_user(p_user_id, p_duplicate_user_id, p_confidence, p_face_rekognition_id);
      RETURN jsonb_build_object('isMatch', false, 'confidence', p_confidence,
        'error_code', 'DUPLICATE_FACE', 'duplicate_of', p_duplicate_user_id, 'banned', true);
    END IF;
  END IF;

  INSERT INTO public.face_verification_submissions (
    user_id, face_image_url, profile_image_url, status, match_confidence,
    face_rekognition_id, verification_method, submitted_at, reviewed_at
  ) VALUES (
    p_user_id, COALESCE(p_live_face_url, p_profile_photo_url), p_profile_photo_url,
    CASE WHEN p_is_match AND p_confidence >= 90 THEN 'approved' ELSE 'rejected' END,
    p_confidence, p_face_rekognition_id, 'rekognition_v3', now(), now()
  ) RETURNING id INTO _submission_id;

  IF p_is_match AND p_confidence >= 90 THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
    SET is_face_verified = true,
        face_verification_image = COALESCE(p_live_face_url, p_profile_photo_url),
        updated_at = now()
    WHERE id = p_user_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);
    _result := jsonb_build_object('isMatch', true, 'confidence', p_confidence,
      'submission_id', _submission_id, 'status', 'approved',
      'face_rekognition_id', p_face_rekognition_id);
  ELSE
    _result := jsonb_build_object('isMatch', false, 'confidence', p_confidence,
      'submission_id', _submission_id, 'status', 'rejected',
      'error_code', CASE WHEN p_confidence < 90 THEN 'LOW_CONFIDENCE' ELSE 'NO_MATCH' END);
  END IF;

  RETURN _result;
END; $$;

REVOKE ALL ON FUNCTION public.process_face_verification_v3(uuid, boolean, numeric, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_face_verification_v3(uuid, boolean, numeric, text, text, text, uuid) TO service_role;