-- Pkg384: Level-5 helper/admin messaging schema + RLS gap closure
-- Context: AdminHelperMessaging and Level5HelperDashboard were using columns/RLS paths
-- that did not exist on helper_admin_messages/helper_message_replies, causing save,
-- read, and screenshot-reply flows to fail.

-- 1) Add missing columns used by the admin and helper UIs.
ALTER TABLE public.helper_admin_messages
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS has_replies boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz;

ALTER TABLE public.helper_message_replies
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS screenshot_url text,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- 2) Backfill/normalize existing data without dropping legacy columns.
UPDATE public.helper_admin_messages
SET title = COALESCE(NULLIF(title, ''), 'Admin Message')
WHERE title IS NULL OR title = '';

UPDATE public.helper_message_replies
SET content = COALESCE(NULLIF(content, ''), reply_text)
WHERE content IS NULL OR content = '';

-- 3) Validation + compatibility triggers.
CREATE OR REPLACE FUNCTION public.pkg384_guard_helper_admin_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.title := left(coalesce(nullif(btrim(NEW.title), ''), 'Admin Message'), 160);
  NEW.message := left(coalesce(nullif(btrim(NEW.message), ''), ''), 5000);
  NEW.priority := lower(coalesce(nullif(btrim(NEW.priority), ''), 'normal'));
  IF NEW.priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    NEW.priority := 'normal';
  END IF;

  IF NEW.message = '' THEN
    RAISE EXCEPTION 'message_required' USING ERRCODE = '22023';
  END IF;

  NEW.sender_type := lower(coalesce(nullif(btrim(NEW.sender_type), ''), 'admin'));
  IF NEW.sender_type NOT IN ('admin', 'system') THEN
    RAISE EXCEPTION 'invalid_sender_type' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Helpers/admins can mark read, but identity fields must not be rewritten.
    NEW.id := OLD.id;
    NEW.helper_id := OLD.helper_id;
    NEW.sender_id := OLD.sender_id;
    NEW.sender_type := OLD.sender_type;
    NEW.created_at := OLD.created_at;
  END IF;

  IF coalesce(NEW.is_read, false) AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pkg384_guard_helper_admin_messages ON public.helper_admin_messages;
CREATE TRIGGER tg_pkg384_guard_helper_admin_messages
BEFORE INSERT OR UPDATE ON public.helper_admin_messages
FOR EACH ROW EXECUTE FUNCTION public.pkg384_guard_helper_admin_messages();

CREATE OR REPLACE FUNCTION public.pkg384_guard_helper_message_replies()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.sender_type := lower(coalesce(nullif(btrim(NEW.sender_type), ''), 'helper'));
  IF NEW.sender_type NOT IN ('admin', 'helper') THEN
    RAISE EXCEPTION 'invalid_sender_type' USING ERRCODE = '22023';
  END IF;

  NEW.content := left(coalesce(nullif(btrim(NEW.content), ''), nullif(btrim(NEW.reply_text), ''), ''), 5000);
  NEW.reply_text := NEW.content;

  IF NEW.content = '' THEN
    RAISE EXCEPTION 'reply_required' USING ERRCODE = '22023';
  END IF;

  IF NEW.screenshot_url IS NOT NULL AND length(NEW.screenshot_url) > 1200 THEN
    RAISE EXCEPTION 'screenshot_url_too_long' USING ERRCODE = '22023';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.id := OLD.id;
    NEW.message_id := OLD.message_id;
    NEW.sender_id := OLD.sender_id;
    NEW.sender_type := OLD.sender_type;
    NEW.created_at := OLD.created_at;
    NEW.reply_text := OLD.reply_text;
    NEW.content := OLD.content;
    NEW.screenshot_url := OLD.screenshot_url;
  END IF;

  IF coalesce(NEW.is_read, false) AND NEW.read_at IS NULL THEN
    NEW.read_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pkg384_guard_helper_message_replies ON public.helper_message_replies;
CREATE TRIGGER tg_pkg384_guard_helper_message_replies
BEFORE INSERT OR UPDATE ON public.helper_message_replies
FOR EACH ROW EXECUTE FUNCTION public.pkg384_guard_helper_message_replies();

CREATE OR REPLACE FUNCTION public.pkg384_mark_helper_message_replied()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.helper_admin_messages
  SET has_replies = true,
      last_reply_at = now()
  WHERE id = NEW.message_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_pkg384_mark_helper_message_replied ON public.helper_message_replies;
CREATE TRIGGER tg_pkg384_mark_helper_message_replied
AFTER INSERT ON public.helper_message_replies
FOR EACH ROW EXECUTE FUNCTION public.pkg384_mark_helper_message_replied();

-- 4) Helper-facing RLS policies. Admin-session policies already exist and remain.
DROP POLICY IF EXISTS pkg384_helpers_read_own_admin_messages ON public.helper_admin_messages;
CREATE POLICY pkg384_helpers_read_own_admin_messages
ON public.helper_admin_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_admin_messages.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
);

DROP POLICY IF EXISTS pkg384_helpers_mark_own_admin_messages_read ON public.helper_admin_messages;
CREATE POLICY pkg384_helpers_mark_own_admin_messages_read
ON public.helper_admin_messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_admin_messages.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.topup_helpers th
    WHERE th.id = helper_admin_messages.helper_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
);

DROP POLICY IF EXISTS pkg384_helpers_read_own_message_replies ON public.helper_message_replies;
CREATE POLICY pkg384_helpers_read_own_message_replies
ON public.helper_message_replies
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.helper_admin_messages ham
    JOIN public.topup_helpers th ON th.id = ham.helper_id
    WHERE ham.id = helper_message_replies.message_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
);

DROP POLICY IF EXISTS pkg384_helpers_insert_own_message_replies ON public.helper_message_replies;
CREATE POLICY pkg384_helpers_insert_own_message_replies
ON public.helper_message_replies
FOR INSERT
TO authenticated
WITH CHECK (
  sender_type = 'helper'
  AND sender_id = auth.uid()
  AND EXISTS (
    SELECT 1
    FROM public.helper_admin_messages ham
    JOIN public.topup_helpers th ON th.id = ham.helper_id
    WHERE ham.id = helper_message_replies.message_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
);

DROP POLICY IF EXISTS pkg384_helpers_mark_admin_replies_read ON public.helper_message_replies;
CREATE POLICY pkg384_helpers_mark_admin_replies_read
ON public.helper_message_replies
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.helper_admin_messages ham
    JOIN public.topup_helpers th ON th.id = ham.helper_id
    WHERE ham.id = helper_message_replies.message_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.helper_admin_messages ham
    JOIN public.topup_helpers th ON th.id = ham.helper_id
    WHERE ham.id = helper_message_replies.message_id
      AND th.user_id = auth.uid()
      AND th.trader_level = 5
      AND th.payroll_enabled = true
      AND th.is_active = true
  )
);

-- 5) Instant admin/app sync for this messaging system.
DO $$
BEGIN
  IF to_regprocedure('public.tg_admin_broadcast_bump()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS tg_admin_broadcast_helper_admin_messages ON public.helper_admin_messages;
    CREATE TRIGGER tg_admin_broadcast_helper_admin_messages
    AFTER INSERT OR UPDATE OR DELETE ON public.helper_admin_messages
    FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump();

    DROP TRIGGER IF EXISTS tg_admin_broadcast_helper_message_replies ON public.helper_message_replies;
    CREATE TRIGGER tg_admin_broadcast_helper_message_replies
    AFTER INSERT OR UPDATE OR DELETE ON public.helper_message_replies
    FOR EACH ROW EXECUTE FUNCTION public.tg_admin_broadcast_bump();
  END IF;
END $$;

-- 6) Function permissions for triggers only; no public direct execution needed.
REVOKE ALL ON FUNCTION public.pkg384_guard_helper_admin_messages() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pkg384_guard_helper_message_replies() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pkg384_mark_helper_message_replied() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pkg384_guard_helper_admin_messages() TO service_role;
GRANT EXECUTE ON FUNCTION public.pkg384_guard_helper_message_replies() TO service_role;
GRANT EXECUTE ON FUNCTION public.pkg384_mark_helper_message_replied() TO service_role;