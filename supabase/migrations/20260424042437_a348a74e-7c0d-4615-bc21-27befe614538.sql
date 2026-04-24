
-- ============================================================
-- 1) FIX CRITICAL: Remove public profiles SELECT exposure
-- ============================================================
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can do everything on profiles" ON public.profiles;

-- Single, clean admin-all policy
CREATE POLICY "Admins manage all profiles"
  ON public.profiles FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Keep existing user-self policies (already in place):
--   "Users can view own profile" / "Users can update own profiles" / "Users can create own profile"

-- ============================================================
-- 2) BALANCE CHANGE AUDIT LOG (tamper-evident)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.balance_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  actor_role text,
  table_name text NOT NULL,
  column_name text NOT NULL,
  old_value bigint,
  new_value bigint,
  delta bigint GENERATED ALWAYS AS (COALESCE(new_value,0) - COALESCE(old_value,0)) STORED,
  rpc_function text,
  bypass_used boolean DEFAULT false,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.balance_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read balance audit" ON public.balance_audit_log;
CREATE POLICY "Admins read balance audit"
  ON public.balance_audit_log FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users read own balance audit" ON public.balance_audit_log;
CREATE POLICY "Users read own balance audit"
  ON public.balance_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Block direct INSERT — only triggers can write
DROP POLICY IF EXISTS "No direct insert" ON public.balance_audit_log;
CREATE POLICY "No direct insert"
  ON public.balance_audit_log FOR INSERT
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_balance_audit_user ON public.balance_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_balance_audit_actor ON public.balance_audit_log(actor_id, created_at DESC);

-- ============================================================
-- 3) AUDIT TRIGGER for profiles (records every balance change)
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_profile_balance_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _bypass boolean := COALESCE(current_setting('app.bypass_profile_protection', true), 'false') = 'true';
  _calling_fn text := COALESCE(current_setting('app.calling_function', true), '');
  _actor uuid := auth.uid();
BEGIN
  IF NEW.coins IS DISTINCT FROM OLD.coins THEN
    INSERT INTO public.balance_audit_log
      (user_id, actor_id, actor_role, table_name, column_name, old_value, new_value, rpc_function, bypass_used)
    VALUES (NEW.id, _actor, current_setting('role', true), 'profiles', 'coins', OLD.coins, NEW.coins, _calling_fn, _bypass);
  END IF;
  IF NEW.beans IS DISTINCT FROM OLD.beans THEN
    INSERT INTO public.balance_audit_log
      (user_id, actor_id, actor_role, table_name, column_name, old_value, new_value, rpc_function, bypass_used)
    VALUES (NEW.id, _actor, current_setting('role', true), 'profiles', 'beans', OLD.beans, NEW.beans, _calling_fn, _bypass);
  END IF;
  IF NEW.diamonds IS DISTINCT FROM OLD.diamonds THEN
    INSERT INTO public.balance_audit_log
      (user_id, actor_id, actor_role, table_name, column_name, old_value, new_value, rpc_function, bypass_used)
    VALUES (NEW.id, _actor, current_setting('role', true), 'profiles', 'diamonds', OLD.diamonds, NEW.diamonds, _calling_fn, _bypass);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_profile_balance_trigger ON public.profiles;
CREATE TRIGGER audit_profile_balance_trigger
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_balance_changes();

-- ============================================================
-- 4) AUDIT TRIGGER for agencies
-- ============================================================
CREATE OR REPLACE FUNCTION public.audit_agency_balance_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _calling_fn text := COALESCE(current_setting('app.calling_function', true), '');
  _actor uuid := auth.uid();
BEGIN
  IF NEW.diamond_balance IS DISTINCT FROM OLD.diamond_balance THEN
    INSERT INTO public.balance_audit_log
      (user_id, actor_id, actor_role, table_name, column_name, old_value, new_value, rpc_function)
    VALUES (NEW.owner_id, _actor, current_setting('role', true), 'agencies', 'diamond_balance', OLD.diamond_balance, NEW.diamond_balance, _calling_fn);
  END IF;
  IF NEW.beans_balance IS DISTINCT FROM OLD.beans_balance THEN
    INSERT INTO public.balance_audit_log
      (user_id, actor_id, actor_role, table_name, column_name, old_value, new_value, rpc_function)
    VALUES (NEW.owner_id, _actor, current_setting('role', true), 'agencies', 'beans_balance', OLD.beans_balance, NEW.beans_balance, _calling_fn);
  END IF;
  IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
    INSERT INTO public.balance_audit_log
      (user_id, actor_id, actor_role, table_name, column_name, old_value, new_value, rpc_function)
    VALUES (NEW.owner_id, _actor, current_setting('role', true), 'agencies', 'wallet_balance', OLD.wallet_balance, NEW.wallet_balance, _calling_fn);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_agency_balance_trigger ON public.agencies;
CREATE TRIGGER audit_agency_balance_trigger
  AFTER UPDATE ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_agency_balance_changes();

-- ============================================================
-- 5) HARDEN profile balance trigger — block negative balances
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_negative_profile_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.coins < 0 THEN RAISE EXCEPTION 'Profile coins cannot be negative (was %, attempted %)', OLD.coins, NEW.coins; END IF;
  IF NEW.diamonds < 0 THEN RAISE EXCEPTION 'Profile diamonds cannot be negative (was %, attempted %)', OLD.diamonds, NEW.diamonds; END IF;
  IF NEW.beans < 0 THEN RAISE EXCEPTION 'Profile beans cannot be negative (was %, attempted %)', OLD.beans, NEW.beans; END IF;
  IF NEW.beans_balance IS NOT NULL AND NEW.beans_balance < 0 THEN
    RAISE EXCEPTION 'Profile beans_balance cannot be negative';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_negative_profile_balance ON public.profiles;
CREATE TRIGGER trigger_prevent_negative_profile_balance
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_negative_profile_balance();

-- ============================================================
-- 6) FIX agencies admin policy to use is_admin() consistently
-- ============================================================
DROP POLICY IF EXISTS "Admins can update all agencies" ON public.agencies;
CREATE POLICY "Admins can update all agencies"
  ON public.agencies FOR UPDATE
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- 7) Make sure balance_audit_log is in realtime publication
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='balance_audit_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.balance_audit_log';
  END IF;
END $$;
