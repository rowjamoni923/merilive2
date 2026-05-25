CREATE OR REPLACE FUNCTION public.consume_otp_exchange_token(
  p_verified_token text,
  p_identifier text,
  p_channel text DEFAULT 'email',
  p_purpose text DEFAULT 'login'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_hash text;
  v_token_id uuid;
BEGIN
  IF p_verified_token IS NULL OR length(p_verified_token) < 32 OR length(p_verified_token) > 128 THEN
    RETURN NULL;
  END IF;

  IF p_identifier IS NULL OR length(trim(p_identifier)) = 0 OR length(p_identifier) > 254 THEN
    RETURN NULL;
  END IF;

  IF p_channel NOT IN ('email', 'phone') THEN
    RETURN NULL;
  END IF;

  IF p_purpose NOT IN ('login', 'register', 'reset', 'verify') THEN
    RETURN NULL;
  END IF;

  v_token_hash := encode(extensions.digest(p_verified_token, 'sha256'), 'hex');

  UPDATE public.otp_exchange_tokens
     SET is_used = true,
         used_at = now()
   WHERE id = (
     SELECT id
       FROM public.otp_exchange_tokens
      WHERE token_hash = v_token_hash
        AND identifier = lower(trim(p_identifier))
        AND channel = p_channel
        AND purpose = p_purpose
        AND is_used = false
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_otp_exchange_token(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_otp_exchange_token(text, text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.check_brute_force(p_identifier text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.check_brute_force(p_identifier, NULL::text, NULL::text)
$function$;

GRANT EXECUTE ON FUNCTION public.check_brute_force(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_brute_force(text, text, text) TO anon, authenticated;