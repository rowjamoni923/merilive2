-- ============================================================
-- PACKAGE 4: ADMIN PANEL SECURITY HARDENING
-- ============================================================

-- 1. face_verification_submissions: drop blanket public ALL policies.
--    The "Admin session full access" policy already provides admin RW.
--    User-owned access remains via existing owner policies (if any) or the
--    edge function flow that already runs server-side.
DROP POLICY IF EXISTS "Admin full access" ON public.face_verification_submissions;
DROP POLICY IF EXISTS "Admin full access to face_verification" ON public.face_verification_submissions;

-- Ensure the submitter can read their own submission (replaces what the
-- bad public policy was incidentally allowing for owners).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='face_verification_submissions'
      AND policyname='Users can view own face submission'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Users can view own face submission"
        ON public.face_verification_submissions
        FOR SELECT
        TO authenticated
        USING (user_id = auth.uid())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='face_verification_submissions'
      AND policyname='Users can insert own face submission'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "Users can insert own face submission"
        ON public.face_verification_submissions
        FOR INSERT
        TO authenticated
        WITH CHECK (user_id = auth.uid())
    $p$;
  END IF;
END $$;

-- 2. admin_allowed_devices: drop the two qual=true public ALL policies.
--    The "Admin session full access" + "Owners can manage all devices" +
--    "Only admins can register devices" + "Admins can view devices" remain
--    and provide proper admin coverage.
DROP POLICY IF EXISTS "Admin full access" ON public.admin_allowed_devices;
DROP POLICY IF EXISTS "Admin full access to admin_allowed_devices" ON public.admin_allowed_devices;
-- "Allow owner full access to devices" overlaps with "Owners can manage all
-- devices" but uses the broader public role; tighten by dropping the public
-- variant since the authenticated owner policy covers it.
DROP POLICY IF EXISTS "Allow owner full access to devices" ON public.admin_allowed_devices;

-- 3. app_icon_registry: drop the wide-open authenticated-write policy.
--    "Admin session full access" + "Admins can manage icon registry" +
--    SELECT-public policies remain.
DROP POLICY IF EXISTS "Authenticated users can manage icons" ON public.app_icon_registry;
-- Deduplicate SELECT — keep one
DROP POLICY IF EXISTS "Anyone can read icons" ON public.app_icon_registry;
-- public_read remains for {anon,authenticated}

-- 4. Storage: drop the blanket "any authenticated user can upload to any
--    bucket" policy. Per-bucket owner policies + admin session policy cover
--    legitimate uploads.
DROP POLICY IF EXISTS "Authenticated Upload Access" ON storage.objects;
-- Drop the equally-loose "any authenticated user can upload to app-assets"
-- since admin session policy handles admin uploads to app-assets.
DROP POLICY IF EXISTS "Authenticated upload to app-assets" ON storage.objects;

-- 5. Admin self-lockout protection trigger.
CREATE OR REPLACE FUNCTION public.prevent_admin_self_lockout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  active_owner_count INT;
BEGIN
  -- UPDATE: prevent self-deactivation
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false AND OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot deactivate your own admin account. Ask another owner.';
    END IF;

    -- Prevent demoting the last active owner
    IF OLD.role = 'owner'::admin_role AND NEW.role <> 'owner'::admin_role THEN
      SELECT COUNT(*) INTO active_owner_count
      FROM public.admin_users
      WHERE role = 'owner'::admin_role AND is_active = true AND id <> OLD.id;
      IF active_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot demote the last active owner. Promote another admin to owner first.';
      END IF;
    END IF;

    -- Prevent deactivating the last active owner
    IF OLD.role = 'owner'::admin_role AND OLD.is_active = true AND NEW.is_active = false THEN
      SELECT COUNT(*) INTO active_owner_count
      FROM public.admin_users
      WHERE role = 'owner'::admin_role AND is_active = true AND id <> OLD.id;
      IF active_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot deactivate the last active owner.';
      END IF;
    END IF;
  END IF;

  -- DELETE: prevent self-delete and last-owner delete
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id = auth.uid() THEN
      RAISE EXCEPTION 'You cannot delete your own admin account.';
    END IF;
    IF OLD.role = 'owner'::admin_role AND OLD.is_active = true THEN
      SELECT COUNT(*) INTO active_owner_count
      FROM public.admin_users
      WHERE role = 'owner'::admin_role AND is_active = true AND id <> OLD.id;
      IF active_owner_count = 0 THEN
        RAISE EXCEPTION 'Cannot delete the last active owner.';
      END IF;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_admin_self_lockout ON public.admin_users;
CREATE TRIGGER trg_prevent_admin_self_lockout
BEFORE UPDATE OR DELETE ON public.admin_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_admin_self_lockout();
