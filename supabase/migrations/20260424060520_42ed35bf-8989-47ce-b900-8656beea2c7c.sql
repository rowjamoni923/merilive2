-- ============================================================
-- ADMIN PANEL HIDDEN ACCESS + HARDCODED OWNERS (April 2026)
-- ============================================================
-- 1. Create a config table for owner whitelist (editable by owners)
-- 2. Enforce: only whitelisted emails can become owners
-- 3. Remove any "extra" owners that are not in the whitelist
-- ============================================================

-- 1) Owner whitelist table
CREATE TABLE IF NOT EXISTS public.admin_owner_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  added_by UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_owner_whitelist ENABLE ROW LEVEL SECURITY;

-- Only existing owners can read / mutate the whitelist
DROP POLICY IF EXISTS "owners_read_whitelist" ON public.admin_owner_whitelist;
CREATE POLICY "owners_read_whitelist" ON public.admin_owner_whitelist
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'owner' AND au.is_active = true
    )
  );

DROP POLICY IF EXISTS "owners_mutate_whitelist" ON public.admin_owner_whitelist;
CREATE POLICY "owners_mutate_whitelist" ON public.admin_owner_whitelist
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'owner' AND au.is_active = true
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users au
      WHERE au.user_id = auth.uid() AND au.role = 'owner' AND au.is_active = true
    )
  );

-- 2) Seed the 2 fixed owners
INSERT INTO public.admin_owner_whitelist (email, display_name, is_active)
VALUES
  ('smtv923@gmail.com', 'Primary Owner', true),
  ('sazzadshifa776@gmail.com', 'Secondary Owner', true)
ON CONFLICT (email) DO UPDATE SET is_active = true;

-- 3) Validation trigger: block role=owner for non-whitelisted emails
CREATE OR REPLACE FUNCTION public.enforce_owner_whitelist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'owner' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.admin_owner_whitelist
      WHERE LOWER(email) = LOWER(NEW.email) AND is_active = true
    ) THEN
      RAISE EXCEPTION 'OWNER_NOT_WHITELISTED: % is not authorized to be an owner', NEW.email;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_owner_whitelist ON public.admin_users;
CREATE TRIGGER trg_enforce_owner_whitelist
BEFORE INSERT OR UPDATE OF role, email ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_owner_whitelist();

-- 4) Demote any existing "extra" owners that are not whitelisted
UPDATE public.admin_users
SET role = 'sub_admin', is_active = false, updated_at = now()
WHERE role = 'owner'
  AND LOWER(email) NOT IN (SELECT LOWER(email) FROM public.admin_owner_whitelist WHERE is_active = true);

-- 5) Owner management RPCs (only owners can call)
CREATE OR REPLACE FUNCTION public.admin_add_owner(
  _admin_id UUID,
  _new_email TEXT,
  _display_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.admin_users WHERE id = _admin_id AND is_active = true;
  IF caller_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can add other owners');
  END IF;

  INSERT INTO public.admin_owner_whitelist (email, display_name, added_by, is_active)
  VALUES (LOWER(_new_email), _display_name, _admin_id, true)
  ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    display_name = COALESCE(EXCLUDED.display_name, admin_owner_whitelist.display_name),
    updated_at = now();

  RETURN jsonb_build_object('success', true, 'email', LOWER(_new_email));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_remove_owner(
  _admin_id UUID,
  _target_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  remaining INT;
BEGIN
  SELECT role INTO caller_role FROM public.admin_users WHERE id = _admin_id AND is_active = true;
  IF caller_role != 'owner' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only owners can remove owners');
  END IF;

  SELECT COUNT(*) INTO remaining FROM public.admin_owner_whitelist
  WHERE is_active = true AND LOWER(email) != LOWER(_target_email);

  IF remaining < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last owner');
  END IF;

  UPDATE public.admin_owner_whitelist SET is_active = false, updated_at = now()
  WHERE LOWER(email) = LOWER(_target_email);

  -- Demote in admin_users too
  UPDATE public.admin_users SET role = 'sub_admin', updated_at = now()
  WHERE LOWER(email) = LOWER(_target_email) AND role = 'owner';

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_owners(_admin_id UUID)
RETURNS TABLE(email TEXT, display_name TEXT, is_active BOOLEAN, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM public.admin_users WHERE id = _admin_id AND is_active = true;
  IF caller_role != 'owner' THEN
    RAISE EXCEPTION 'Only owners can list owners';
  END IF;

  RETURN QUERY
  SELECT w.email, w.display_name, w.is_active, w.created_at
  FROM public.admin_owner_whitelist w
  ORDER BY w.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_owner(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_owner(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_owners(UUID) TO anon, authenticated;

-- 6) Block signup attempts via auth flow for non-whitelisted owner emails
-- (prevents anyone from ever signing up as a fake owner)
COMMENT ON TABLE public.admin_owner_whitelist IS 'Single source of truth for who can be an admin owner. Editable only by existing owners via admin_add_owner / admin_remove_owner RPCs.';