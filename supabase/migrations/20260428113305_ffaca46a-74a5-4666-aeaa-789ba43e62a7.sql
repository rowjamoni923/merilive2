-- Phase 4 — Auto-apply VIP/Noble recharge bonus on every successful recharge
-- Hooks ALL gateways (ZiniPay, Stripe, Local, etc.) without touching edge functions.

CREATE OR REPLACE FUNCTION public.trigger_apply_recharge_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  -- Only fire on completed recharges with a positive coin amount
  IF COALESCE(NEW.status, '') <> 'completed' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.coins_added, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Idempotency: if a row in vip_recharge_bonus_log already exists for this recharge, skip
  IF EXISTS (
    SELECT 1 FROM public.vip_recharge_bonus_log
    WHERE recharge_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT public.apply_vip_recharge_bonus(NEW.user_id, NEW.id, NEW.coins_added)
    INTO _result;
  EXCEPTION WHEN OTHERS THEN
    -- Never block the recharge insert if bonus calc fails
    RAISE WARNING '[recharge_bonus_trigger] failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recharge_apply_vip_bonus ON public.recharge_transactions;

CREATE TRIGGER trg_recharge_apply_vip_bonus
AFTER INSERT ON public.recharge_transactions
FOR EACH ROW
EXECUTE FUNCTION public.trigger_apply_recharge_bonus();

-- Also handle status flips from pending -> completed
DROP TRIGGER IF EXISTS trg_recharge_apply_vip_bonus_upd ON public.recharge_transactions;

CREATE TRIGGER trg_recharge_apply_vip_bonus_upd
AFTER UPDATE OF status ON public.recharge_transactions
FOR EACH ROW
WHEN (NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed')
EXECUTE FUNCTION public.trigger_apply_recharge_bonus();

-- Helpful indexes for noble/vip lookups
CREATE INDEX IF NOT EXISTS idx_user_noble_subs_active
  ON public.user_noble_subscriptions (user_id, is_active, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_vip_subs_active
  ON public.user_vip_subscriptions (user_id, is_active, expires_at);

CREATE INDEX IF NOT EXISTS idx_vip_recharge_bonus_log_recharge
  ON public.vip_recharge_bonus_log (recharge_id);
