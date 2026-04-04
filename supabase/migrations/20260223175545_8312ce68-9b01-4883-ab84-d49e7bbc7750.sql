-- ====================================================
-- CRITICAL: Prevent Direct Balance Manipulation
-- This trigger blocks any direct UPDATE to financial columns
-- Only allows changes through authorized RPC functions
-- ====================================================

CREATE OR REPLACE FUNCTION prevent_balance_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if called from an authorized RPC function (SECURITY DEFINER context)
  -- Check if the current user is the postgres/service_role (used by RPC functions)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_prevent_balance_manipulation ON profiles;
CREATE TRIGGER trigger_prevent_balance_manipulation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_balance_manipulation();

-- ====================================================
-- AGENCY: Prevent direct diamond_balance manipulation
-- ====================================================

CREATE OR REPLACE FUNCTION prevent_agency_balance_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR
     current_setting('role', true) = 'postgres' OR
     current_user = 'postgres' OR
     current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  IF OLD.diamond_balance IS DISTINCT FROM NEW.diamond_balance THEN
    RAISE EXCEPTION 'Direct agency diamond balance modification is not allowed.';
  END IF;

  IF OLD.beans_balance IS DISTINCT FROM NEW.beans_balance THEN
    RAISE EXCEPTION 'Direct agency beans balance modification is not allowed.';
  END IF;

  IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    RAISE EXCEPTION 'Direct agency wallet balance modification is not allowed.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_prevent_agency_balance_manipulation ON agencies;
CREATE TRIGGER trigger_prevent_agency_balance_manipulation
  BEFORE UPDATE ON agencies
  FOR EACH ROW
  EXECUTE FUNCTION prevent_agency_balance_manipulation();

-- ====================================================
-- HELPER WALLET: Prevent direct wallet_balance manipulation
-- ====================================================

CREATE OR REPLACE FUNCTION prevent_helper_wallet_manipulation()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' OR
     current_setting('role', true) = 'postgres' OR
     current_user = 'postgres' OR
     current_user = 'supabase_admin' THEN
    RETURN NEW;
  END IF;

  IF OLD.wallet_balance IS DISTINCT FROM NEW.wallet_balance THEN
    RAISE EXCEPTION 'Direct helper wallet balance modification is not allowed.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trigger_prevent_helper_wallet_manipulation ON topup_helpers;
CREATE TRIGGER trigger_prevent_helper_wallet_manipulation
  BEFORE UPDATE ON topup_helpers
  FOR EACH ROW
  EXECUTE FUNCTION prevent_helper_wallet_manipulation();

-- ====================================================
-- GAME TRANSACTIONS: Block direct inserts to game results
-- ====================================================

-- Ensure roulette_bets can only be created through RPC
DROP POLICY IF EXISTS "No direct roulette bet inserts" ON roulette_bets;
CREATE POLICY "No direct roulette bet inserts"
ON roulette_bets
FOR INSERT
TO authenticated
WITH CHECK (false);

-- Ensure gift_transactions INSERT is through RPC only  
DROP POLICY IF EXISTS "No direct gift transaction inserts" ON gift_transactions;
CREATE POLICY "No direct gift transaction inserts"
ON gift_transactions
FOR INSERT
TO authenticated
WITH CHECK (false);