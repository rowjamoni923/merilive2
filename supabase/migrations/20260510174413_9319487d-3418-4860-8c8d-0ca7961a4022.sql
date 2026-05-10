-- Fix admin Game Management stats: current DB has game_stats without stat_date/game_id aggregate columns.
-- This function calculates today's stats from the real game_transactions table instead.
CREATE OR REPLACE FUNCTION public.admin_game_today_stats()
RETURNS TABLE(
  game_id text,
  total_bets bigint,
  total_bet_amount numeric,
  total_wins bigint,
  total_win_amount numeric,
  house_profit numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(gt.game_id, gt.game_type, 'unknown')::text AS game_id,
    COUNT(*) FILTER (WHERE gt.transaction_type = 'bet' OR COALESCE(gt.bet_amount, 0) > 0)::bigint AS total_bets,
    COALESCE(SUM(
      CASE
        WHEN gt.transaction_type = 'bet' THEN COALESCE(NULLIF(gt.bet_amount, 0), gt.amount, 0)
        ELSE COALESCE(gt.bet_amount, 0)
      END
    ), 0)::numeric AS total_bet_amount,
    COUNT(*) FILTER (WHERE gt.transaction_type IN ('win', 'jackpot') OR COALESCE(gt.is_win, false))::bigint AS total_wins,
    COALESCE(SUM(
      CASE
        WHEN gt.transaction_type IN ('win', 'jackpot') OR COALESCE(gt.is_win, false)
          THEN COALESCE(NULLIF(gt.win_amount, 0), gt.amount, 0)
        ELSE COALESCE(gt.win_amount, 0)
      END
    ), 0)::numeric AS total_win_amount,
    (
      COALESCE(SUM(
        CASE
          WHEN gt.transaction_type = 'bet' THEN COALESCE(NULLIF(gt.bet_amount, 0), gt.amount, 0)
          ELSE COALESCE(gt.bet_amount, 0)
        END
      ), 0)
      -
      COALESCE(SUM(
        CASE
          WHEN gt.transaction_type IN ('win', 'jackpot') OR COALESCE(gt.is_win, false)
            THEN COALESCE(NULLIF(gt.win_amount, 0), gt.amount, 0)
          ELSE COALESCE(gt.win_amount, 0)
        END
      ), 0)
    )::numeric AS house_profit
  FROM public.game_transactions gt
  WHERE gt.created_at >= CURRENT_DATE::timestamptz
    AND gt.created_at < (CURRENT_DATE + 1)::timestamptz
  GROUP BY COALESCE(gt.game_id, gt.game_type, 'unknown')::text
$$;

REVOKE ALL ON FUNCTION public.admin_game_today_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_game_today_stats() TO authenticated, anon;

-- Fix contact violation processor to match the live schema:
-- host_contact_violations uses user_id/severity/action_taken, not host_id/violation_number/source fields.
-- chat_moderation_logs uses original_content, not detected_content/conversation_id/is_auto_action/notes.
CREATE OR REPLACE FUNCTION public.process_contact_violation(
  p_host_id uuid,
  p_detected_content text,
  p_detected_pattern text,
  p_source_type text,
  p_source_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_verified_host boolean := false;
  v_violation_count integer := 0;
  v_new_violation_number integer := 1;
  v_beans_deducted integer := 0;
  v_latest_violation_id uuid;
  v_severity text := 'low';
  v_action text := 'warning_only';
BEGIN
  SELECT (
    COALESCE(is_host, false) = true
    AND lower(COALESCE(host_status::text, '')) = 'approved'
    AND COALESCE(is_face_verified, false) = true
  )
  INTO v_is_verified_host
  FROM public.profiles
  WHERE id = p_host_id;

  IF COALESCE(v_is_verified_host, false) THEN
    SELECT COUNT(*) INTO v_violation_count
    FROM public.host_contact_violations
    WHERE user_id = p_host_id;

    v_new_violation_number := LEAST(v_violation_count + 1, 10);
    v_beans_deducted := 2000;
    v_severity := CASE
      WHEN v_new_violation_number >= 5 THEN 'critical'
      WHEN v_new_violation_number >= 3 THEN 'high'
      WHEN v_new_violation_number = 2 THEN 'medium'
      ELSE 'low'
    END;
    v_action := 'beans_deducted_2000';

    UPDATE public.profiles
    SET weekly_earnings = GREATEST(COALESCE(weekly_earnings, 0) - v_beans_deducted, 0),
        beans = GREATEST(COALESCE(beans, 0) - v_beans_deducted, 0),
        updated_at = now()
    WHERE id = p_host_id;

    INSERT INTO public.host_contact_violations (
      user_id,
      violation_type,
      detected_content,
      severity,
      action_taken,
      created_at
    ) VALUES (
      p_host_id,
      COALESCE(NULLIF(p_detected_pattern, ''), 'contact_sharing'),
      p_detected_content,
      v_severity,
      v_action,
      now()
    )
    RETURNING id INTO v_latest_violation_id;
  ELSE
    SELECT COUNT(*) INTO v_violation_count
    FROM public.user_contact_violations
    WHERE user_id = p_host_id;

    v_new_violation_number := LEAST(v_violation_count + 1, 10);

    INSERT INTO public.user_contact_violations (
      user_id,
      violation_number,
      violation_type,
      detected_content,
      detected_pattern,
      source_type,
      source_id,
      coins_deducted,
      is_auto_detected,
      created_at
    ) VALUES (
      p_host_id,
      v_new_violation_number,
      'contact_sharing',
      p_detected_content,
      p_detected_pattern,
      p_source_type,
      p_source_id,
      0,
      true,
      now()
    )
    RETURNING id INTO v_latest_violation_id;
  END IF;

  INSERT INTO public.chat_moderation_logs (
    user_id,
    violation_type,
    original_content,
    action_taken,
    detected_at,
    created_at
  ) VALUES (
    p_host_id,
    COALESCE(NULLIF(p_detected_pattern, ''), 'contact_sharing'),
    p_detected_content,
    v_action,
    now(),
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'violation_id', v_latest_violation_id,
    'violation_number', v_new_violation_number,
    'beans_deducted', v_beans_deducted,
    'coins_deducted', 0,
    'is_banned', false,
    'is_verified_host_policy', COALESCE(v_is_verified_host, false)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_contact_violation(uuid, text, text, text, text) TO anon, authenticated;