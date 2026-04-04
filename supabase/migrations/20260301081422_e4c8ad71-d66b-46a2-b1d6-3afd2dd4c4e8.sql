
-- Fix: prevent_balance_manipulation trigger uses wrong bypass logic
-- It checks current_setting('role') which does NOT detect SECURITY DEFINER context
-- The protect_sensitive_profile_columns trigger already handles this correctly
-- using current_user IS DISTINCT FROM session_user

-- Update prevent_balance_manipulation to use the same bypass logic
CREATE OR REPLACE FUNCTION public.prevent_balance_manipulation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If current_user differs from session_user, we're inside a SECURITY DEFINER function - allow
  IF current_user IS DISTINCT FROM session_user THEN
    RETURN NEW;
  END IF;

  -- Also allow service_role / postgres direct access
  IF current_setting('role', true) = 'service_role' OR
     current_setting('role', true) = 'postgres' OR
     current_user = 'postgres' OR
     current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  -- Block direct balance changes from anon/authenticated roles
  IF OLD.coins IS DISTINCT FROM NEW.coins THEN
    RAISE EXCEPTION 'Direct coin balance modification is not allowed. Use authorized functions.';
  END IF;

  IF OLD.beans IS DISTINCT FROM NEW.beans THEN
    RAISE EXCEPTION 'Direct beans balance modification is not allowed. Use authorized functions.';
  END IF;

  IF OLD.total_earnings IS DISTINCT FROM NEW.total_earnings THEN
    RAISE EXCEPTION 'Direct earnings modification is not allowed. Use authorized functions.';
  END IF;

  IF OLD.total_consumption IS DISTINCT FROM NEW.total_consumption THEN
    RAISE EXCEPTION 'Direct consumption modification is not allowed. Use authorized functions.';
  END IF;

  RETURN NEW;
END;
$$;
