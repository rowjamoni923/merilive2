DROP FUNCTION IF EXISTS public.recover_session_by_device(text);

CREATE TABLE IF NOT EXISTS public.device_session_exchange_tokens (
  token text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  consumed_at timestamptz,
  consumer_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.device_session_exchange_tokens TO service_role;

ALTER TABLE public.device_session_exchange_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct device exchange token access" ON public.device_session_exchange_tokens;
CREATE POLICY "No direct device exchange token access"
ON public.device_session_exchange_tokens
FOR ALL
USING (false)
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_device_session_exchange_tokens_device
  ON public.device_session_exchange_tokens(device_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_device_session_exchange_tokens_valid
  ON public.device_session_exchange_tokens(token, device_id, expires_at)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.recover_session_by_device(p_device_id text)
RETURNS TABLE(
  user_id uuid,
  display_name text,
  avatar_url text,
  gender text,
  is_host boolean,
  exchange_token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_device_id text := left(coalesce(p_device_id, ''), 160);
  v_profile record;
  v_token text;
BEGIN
  IF v_device_id !~ '^device_[A-Za-z0-9_:-]{6,128}$' THEN
    RETURN;
  END IF;

  DELETE FROM public.device_session_exchange_tokens
  WHERE expires_at < now() - interval '1 day'
     OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '1 day');

  SELECT p.id, p.display_name, p.avatar_url, p.gender, COALESCE(p.is_host, false) AS is_host
  INTO v_profile
  FROM public.profiles p
  WHERE p.device_id = v_device_id
    AND COALESCE(p.is_deleted, false) = false
    AND COALESCE(p.is_banned, false) = false
    AND COALESCE(p.is_blocked, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.banned_devices bd
      WHERE bd.device_id = v_device_id
        AND COALESCE(bd.is_active, true) = true
    )
  ORDER BY p.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_profile.id IS NULL THEN
    RETURN;
  END IF;

  IF (
    SELECT count(*)
    FROM public.device_session_exchange_tokens t
    WHERE t.device_id = v_device_id
      AND t.created_at > now() - interval '10 minutes'
  ) > 20 THEN
    RETURN;
  END IF;

  UPDATE public.device_session_exchange_tokens
  SET consumed_at = COALESCE(consumed_at, now())
  WHERE device_id = v_device_id
    AND consumed_at IS NULL;

  v_token := gen_random_uuid()::text;
  INSERT INTO public.device_session_exchange_tokens(token, user_id, device_id)
  VALUES (v_token, v_profile.id, v_device_id);

  RETURN QUERY SELECT
    v_profile.id::uuid,
    v_profile.display_name::text,
    v_profile.avatar_url::text,
    v_profile.gender::text,
    v_profile.is_host::boolean,
    v_token::text;
END;
$function$;

REVOKE ALL ON FUNCTION public.recover_session_by_device(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_session_by_device(text) TO anon, authenticated;