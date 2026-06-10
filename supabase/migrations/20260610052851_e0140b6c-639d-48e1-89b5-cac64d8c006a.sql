-- R2-Phase C Wave-1: FCM token dedup (R2-H4)

ALTER TABLE public.device_tokens
  ADD COLUMN IF NOT EXISTS device_id text;

-- Token globally unique (one FCM token belongs to exactly one install).
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_token_unique
  ON public.device_tokens (token);

-- One active token per (user, physical device). Partial: only rows that have
-- device_id participate (legacy rows without device_id keep working).
CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_user_device_active_unique
  ON public.device_tokens (user_id, device_id)
  WHERE is_active = true AND device_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_active
  ON public.device_tokens (user_id) WHERE is_active = true;

-- RPC: atomically register/refresh the caller's FCM token for a device.
-- - Deactivates any OTHER active tokens this user has bound to the same device
--   (handles FCM token rotation cleanly — no dead-token spam).
-- - Upserts the row on the token PK so the same install on a new user gets
--   re-pointed instead of creating a duplicate.
CREATE OR REPLACE FUNCTION public.register_device_token(
  p_token text,
  p_platform text,
  p_device_id text,
  p_device_info jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_token IS NULL OR length(p_token) < 10 THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  -- Deactivate prior tokens for the same (user, device) that aren't this one.
  IF p_device_id IS NOT NULL AND length(p_device_id) > 0 THEN
    UPDATE public.device_tokens
       SET is_active = false, updated_at = now()
     WHERE user_id = v_uid
       AND device_id = p_device_id
       AND token <> p_token
       AND is_active = true;
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform, device_id, is_active, device_info)
  VALUES (v_uid, p_token, p_platform, p_device_id, true, COALESCE(p_device_info, '{}'::jsonb))
  ON CONFLICT (token) DO UPDATE
     SET user_id = EXCLUDED.user_id,
         platform = EXCLUDED.platform,
         device_id = COALESCE(EXCLUDED.device_id, public.device_tokens.device_id),
         is_active = true,
         device_info = EXCLUDED.device_info,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_token(text, text, text, jsonb) TO authenticated;

-- One-time cleanup: where a user has multiple active rows that share the same
-- token, keep only the newest. (Pre-dedup duplicates.)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY token ORDER BY updated_at DESC NULLS LAST, created_at DESC) AS rn
    FROM public.device_tokens
   WHERE is_active = true
)
UPDATE public.device_tokens d
   SET is_active = false, updated_at = now()
  FROM ranked r
 WHERE d.id = r.id AND r.rn > 1;
