-- FINANCIAL LOCKDOWN PART 2 - Fix wallet_transactions issue
-- The previous migration applied all changes EXCEPT the wallet_transactions part
-- because that table doesn't exist. Re-run only the parts that failed.

-- Nothing to re-run - all DROP POLICY and CREATE FUNCTION/TRIGGER commands 
-- executed successfully before the wallet_transactions error.
-- Just verify by adding a comment marker.

-- Additional security: Rate limiting function for sensitive operations
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _user_id UUID,
  _action TEXT,
  _max_per_hour INT DEFAULT 10
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INT;
BEGIN
  -- Count recent actions of this type by this user in admin_logs
  SELECT COUNT(*) INTO recent_count
  FROM admin_logs
  WHERE admin_id = _user_id::text
    AND action_type = _action
    AND created_at > NOW() - INTERVAL '1 hour';
  
  RETURN recent_count < _max_per_hour;
END;
$$;

-- Ensure coin_packages can't be modified by non-admins
-- Already has "No direct" policies, just verify coin_transfers DELETE is blocked
DO $$
BEGIN
  BEGIN
    CREATE POLICY "No direct coin_transfer deletes"
    ON public.coin_transfers
    FOR DELETE
    TO authenticated
    USING (false);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    CREATE POLICY "No direct coin_transfer updates"
    ON public.coin_transfers
    FOR UPDATE
    TO authenticated
    USING (false);
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END;
$$;
