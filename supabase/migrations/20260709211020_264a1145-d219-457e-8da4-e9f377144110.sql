-- ================================================================
-- FIX #1: Hourly live-host bonus never credited beans to profile.
-- Add trigger: when is_completed flips false→true (or row inserted
-- already-completed), credit bonus_amount to profiles.beans, mark
-- bonus_claimed=true, set claimed_beans + claimed_at. Idempotent.
-- Then one-time backfill for the 5 completed-but-unpaid rows.
-- ================================================================

CREATE OR REPLACE FUNCTION public.credit_new_host_live_bonus()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pay bigint;
  _new_balance bigint;
BEGIN
  -- Guard: only pay when this row transitions to completed and not-yet-claimed.
  IF NEW.is_completed IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.bonus_claimed, false) = true THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.is_completed, false) = true
     AND COALESCE(OLD.bonus_claimed, false) = false
     AND OLD.bonus_amount = NEW.bonus_amount THEN
    -- no change we care about
    NULL;
  END IF;

  _pay := COALESCE(NEW.bonus_amount, 0);
  IF _pay <= 0 THEN
    RETURN NEW;
  END IF;

  -- Credit beans (bypass profile update protection trigger)
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  UPDATE public.profiles
     SET beans = COALESCE(beans, 0) + _pay,
         updated_at = now()
   WHERE id = NEW.host_id
  RETURNING COALESCE(beans, 0) INTO _new_balance;
  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF _new_balance IS NULL THEN
    -- host profile missing; do NOT flip bonus_claimed so admin can investigate
    RETURN NEW;
  END IF;

  NEW.bonus_claimed := true;
  NEW.claimed_beans := _pay;
  NEW.claimed_at    := now();
  IF NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;

  -- Optional audit ledger row (table may or may not exist depending on Phase 0)
  BEGIN
    INSERT INTO public.wallet_ledger_audit (
      user_id, currency, delta, balance_before, balance_after,
      source_type, source_id, source_table, metadata, created_at
    ) VALUES (
      NEW.host_id, 'beans', _pay, _new_balance - _pay, _new_balance,
      'new_host_bonus', NEW.id::text, 'new_host_live_bonus_progress',
      jsonb_build_object('program_day', NEW.program_day, 'hour_number', NEW.hour_number),
      now()
    );
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_credit_new_host_live_bonus_ins ON public.new_host_live_bonus_progress;
DROP TRIGGER IF EXISTS tg_credit_new_host_live_bonus_upd ON public.new_host_live_bonus_progress;

CREATE TRIGGER tg_credit_new_host_live_bonus_ins
BEFORE INSERT ON public.new_host_live_bonus_progress
FOR EACH ROW
WHEN (NEW.is_completed = true AND COALESCE(NEW.bonus_claimed, false) = false)
EXECUTE FUNCTION public.credit_new_host_live_bonus();

CREATE TRIGGER tg_credit_new_host_live_bonus_upd
BEFORE UPDATE OF is_completed, bonus_claimed ON public.new_host_live_bonus_progress
FOR EACH ROW
WHEN (NEW.is_completed = true AND COALESCE(NEW.bonus_claimed, false) = false)
EXECUTE FUNCTION public.credit_new_host_live_bonus();

-- BACKFILL: credit already-completed but unpaid rows (5 rows in prod right now).
DO $$
DECLARE
  r RECORD;
  _bal bigint;
BEGIN
  FOR r IN
    SELECT id, host_id, bonus_amount, program_day, hour_number
    FROM public.new_host_live_bonus_progress
    WHERE is_completed = true
      AND COALESCE(bonus_claimed, false) = false
      AND COALESCE(bonus_amount, 0) > 0
    FOR UPDATE
  LOOP
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET beans = COALESCE(beans, 0) + r.bonus_amount,
           updated_at = now()
     WHERE id = r.host_id
    RETURNING COALESCE(beans, 0) INTO _bal;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    IF _bal IS NULL THEN CONTINUE; END IF;

    UPDATE public.new_host_live_bonus_progress
       SET bonus_claimed = true,
           claimed_beans = r.bonus_amount,
           claimed_at    = now(),
           completed_at  = COALESCE(completed_at, now())
     WHERE id = r.id;

    BEGIN
      INSERT INTO public.wallet_ledger_audit (
        user_id, currency, delta, balance_before, balance_after,
        source_type, source_id, source_table, metadata, created_at
      ) VALUES (
        r.host_id, 'beans', r.bonus_amount, _bal - r.bonus_amount, _bal,
        'new_host_bonus_backfill', r.id::text, 'new_host_live_bonus_progress',
        jsonb_build_object('program_day', r.program_day, 'hour_number', r.hour_number, 'backfill', true),
        now()
      );
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;

-- ================================================================
-- FIX #2: approve_rating_reward credits 'coins' when reward_type is
-- 'diamonds'. Route diamonds → profiles.diamonds column.
-- ================================================================

CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claim RECORD;
  v_amount bigint;
  v_type text;
  v_balance_after bigint;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_claim
  FROM public.rating_reward_claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found');
  END IF;

  IF v_claim.status IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyProcessed', true,
      'claim_id', p_claim_id,
      'status', v_claim.status,
      'reward_type', v_claim.reward_type,
      'reward_amount', COALESCE(v_claim.reward_amount, 0)
    );
  END IF;

  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim is not pending');
  END IF;

  v_type := COALESCE(NULLIF(v_claim.reward_type, ''), 'diamonds');
  v_amount := COALESCE(v_claim.reward_amount, v_claim.reward_coins, 0);

  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim reward data missing or invalid');
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  IF v_type = 'beans' THEN
    UPDATE public.profiles
    SET beans = COALESCE(beans, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(beans, 0) INTO v_balance_after;
  ELSIF v_type = 'diamonds' THEN
    UPDATE public.profiles
    SET diamonds = COALESCE(diamonds, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(diamonds, 0) INTO v_balance_after;
  ELSE
    -- fallback: coins
    UPDATE public.profiles
    SET coins = COALESCE(coins, 0) + v_amount,
        updated_at = now()
    WHERE id = v_claim.user_id
    RETURNING COALESCE(coins, 0) INTO v_balance_after;
  END IF;

  PERFORM set_config('app.bypass_profile_protection', 'false', true);

  IF v_balance_after IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE public.rating_reward_claims
  SET status = 'approved',
      reviewed_by = p_admin_id,
      reviewed_at = now(),
      rejection_reason = NULL,
      reward_type = v_type,
      reward_amount = v_amount
  WHERE id = p_claim_id
    AND status = 'pending';

  RETURN jsonb_build_object(
    'success', true,
    'claim_id', p_claim_id,
    'status', 'approved',
    'reward_type', v_type,
    'reward_amount', v_amount,
    'new_balance', v_balance_after
  );
END;
$function$;

-- ================================================================
-- CORRECTION: any past-approved diamond claim that mistakenly landed
-- in profiles.coins → move it. Move coins → diamonds on affected users.
-- Only rows where reward_type='diamonds' AND status='approved'.
-- ================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT user_id, sum(COALESCE(reward_amount,0))::bigint AS diamonds_owed
    FROM public.rating_reward_claims
    WHERE status='approved' AND reward_type='diamonds'
    GROUP BY user_id
    HAVING sum(COALESCE(reward_amount,0)) > 0
  LOOP
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE public.profiles
       SET coins = GREATEST(COALESCE(coins,0) - r.diamonds_owed, 0),
           diamonds = COALESCE(diamonds,0) + r.diamonds_owed,
           updated_at = now()
     WHERE id = r.user_id;
    PERFORM set_config('app.bypass_profile_protection', 'false', true);

    BEGIN
      INSERT INTO public.wallet_ledger_audit (
        user_id, currency, delta, source_type, source_table, metadata, created_at
      ) VALUES
        (r.user_id, 'coins',   -r.diamonds_owed, 'admin_adjust', 'rating_reward_claims',
         jsonb_build_object('reason','misrouted_diamonds_to_coins_correction'), now()),
        (r.user_id, 'diamonds', r.diamonds_owed, 'admin_adjust', 'rating_reward_claims',
         jsonb_build_object('reason','misrouted_diamonds_to_coins_correction'), now());
    EXCEPTION WHEN undefined_table THEN NULL;
    END;
  END LOOP;
END $$;