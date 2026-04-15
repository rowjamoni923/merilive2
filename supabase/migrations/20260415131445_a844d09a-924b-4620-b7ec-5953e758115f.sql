
-- Fix: Recharge triggers only fire on UPDATE but records are INSERTed with status='completed'
-- Need to add AFTER INSERT triggers

-- 1. Fix update_total_recharged to handle INSERT
CREATE OR REPLACE FUNCTION public.update_total_recharged()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Handle INSERT: if inserted with completed status
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles
    SET total_recharged = COALESCE(total_recharged, 0) + COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0)
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  -- Handle UPDATE: status changed to completed
  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles
    SET total_recharged = COALESCE(total_recharged, 0) + COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0)
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 2. Fix update_consumption_on_recharge to handle INSERT
CREATE OR REPLACE FUNCTION public.update_consumption_on_recharge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles
    SET total_consumption = COALESCE(total_consumption, 0) + COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0)
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles
    SET total_consumption = COALESCE(total_consumption, 0) + COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0)
    WHERE id = NEW.user_id;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Fix notify_on_recharge_completed to handle INSERT
CREATE OR REPLACE FUNCTION public.notify_on_recharge_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'completed' THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'recharge_completed', '💰 Recharge Successful!',
      'Your recharge of ' || COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0)::text || ' diamonds is complete.',
      jsonb_build_object('amount', COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0), 'transaction_id', NEW.id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    INSERT INTO notifications (user_id, type, title, message, data)
    VALUES (NEW.user_id, 'recharge_completed', '💰 Recharge Successful!',
      'Your recharge of ' || COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0)::text || ' diamonds is complete.',
      jsonb_build_object('amount', COALESCE(NEW.coins_credited, NEW.coins_received, NEW.amount, 0), 'transaction_id', NEW.id));
    RETURN NEW;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END;
$$;

-- 4. Add INSERT triggers (keep existing UPDATE triggers)
CREATE TRIGGER trigger_update_total_recharged_on_insert
  AFTER INSERT ON public.recharge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_total_recharged();

CREATE TRIGGER trigger_update_consumption_on_insert
  AFTER INSERT ON public.recharge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_consumption_on_recharge();

CREATE TRIGGER trigger_notify_recharge_on_insert
  AFTER INSERT ON public.recharge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_on_recharge_completed();
