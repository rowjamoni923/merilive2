CREATE TABLE IF NOT EXISTS public.agency_app_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  otp_hash text NOT NULL,
  exchange_token_hash text,
  purpose text NOT NULL DEFAULT 'agency_verification',
  context text,
  attempts integer NOT NULL DEFAULT 0,
  is_used boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_app_otps ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_agency_app_otps_lookup
  ON public.agency_app_otps (user_id, purpose, is_used, expires_at, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agency_app_otps_exchange_token_hash
  ON public.agency_app_otps (exchange_token_hash)
  WHERE exchange_token_hash IS NOT NULL;

REVOKE ALL ON public.agency_app_otps FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_agency_app_otp_token(
  p_user_id uuid,
  p_verified_token text,
  p_purpose text DEFAULT 'agency_verification'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_token_hash text;
  v_otp_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_verified_token IS NULL OR length(p_verified_token) < 32 OR length(p_verified_token) > 128 THEN
    RETURN NULL;
  END IF;

  IF p_purpose NOT IN ('agency_verification', 'sub_agency_verification') THEN
    RETURN NULL;
  END IF;

  v_token_hash := encode(extensions.digest(p_verified_token, 'sha256'), 'hex');

  UPDATE public.agency_app_otps
     SET is_used = true,
         used_at = now()
   WHERE id = (
     SELECT id
       FROM public.agency_app_otps
      WHERE user_id = p_user_id
        AND purpose = p_purpose
        AND exchange_token_hash = v_token_hash
        AND verified_at IS NOT NULL
        AND is_used = false
        AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING id INTO v_otp_id;

  RETURN v_otp_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_agency_app_otp_token(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_agency_app_otp_token(uuid, text, text) TO service_role;