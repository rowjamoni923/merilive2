
-- =====================================================
-- FIX #1: Add missing columns to call_events table
-- Without these, end_private_call() and update_host_call_earnings() 
-- CRASH on every call, preventing calls from ending properly
-- =====================================================

ALTER TABLE public.call_events 
ADD COLUMN IF NOT EXISTS call_id UUID,
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS event_data JSONB;

-- Add index for call_id lookups
CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON public.call_events(call_id);
CREATE INDEX IF NOT EXISTS idx_call_events_event_type ON public.call_events(event_type);

-- =====================================================
-- FIX #2: Make update_host_call_earnings graceful
-- It should NOT crash-and-raise if call_events insert fails
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_host_call_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Log status transitions
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      INSERT INTO public.call_events (call_id, event_type, event_data)
      VALUES (
        NEW.id,
        'call_status_transition',
        jsonb_build_object(
          'old_status', OLD.status,
          'new_status', NEW.status,
          'host_earnings_amount', COALESCE(NEW.host_earnings_amount, 0),
          'host_earned', COALESCE(NEW.host_earned, 0),
          'coins_spent', COALESCE(NEW.coins_spent, 0),
          'total_coins_deducted', COALESCE(NEW.total_coins_deducted, 0)
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log but DON'T crash - call must still end properly
      RAISE LOG 'update_host_call_earnings: call_events insert failed for call %: %', NEW.id, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- =====================================================
-- FIX #3: Fix add_to_weekly_earnings to use receiver_beans
-- instead of recalculating (prevents mismatch with update_host_earnings_on_gift)
-- =====================================================

CREATE OR REPLACE FUNCTION public.add_to_weekly_earnings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _receiver_is_host boolean;
  _beans_amount numeric;
BEGIN
  SELECT is_host INTO _receiver_is_host FROM profiles WHERE id = NEW.receiver_id;
  
  IF _receiver_is_host = true THEN
    -- Use pre-calculated receiver_beans (same as update_host_earnings_on_gift)
    IF NEW.receiver_beans IS NOT NULL AND NEW.receiver_beans > 0 THEN
      _beans_amount := NEW.receiver_beans;
    ELSE
      _beans_amount := FLOOR(NEW.coin_amount * public.get_effective_host_percent() / 100);
    END IF;
    
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    UPDATE profiles 
    SET weekly_earnings = COALESCE(weekly_earnings, 0) + _beans_amount 
    WHERE id = NEW.receiver_id;
  END IF;
  
  RETURN NEW;
END;
$$;
