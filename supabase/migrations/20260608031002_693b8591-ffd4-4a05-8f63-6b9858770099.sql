
CREATE OR REPLACE FUNCTION public.submit_call_rating(_call_id uuid, _rating integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.private_calls%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  IF _rating IS NULL OR _rating < 1 OR _rating > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_rating');
  END IF;
  SELECT * INTO _row FROM public.private_calls WHERE id = _call_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF _uid = _row.caller_id THEN
    UPDATE public.private_calls
      SET caller_rating = _rating, updated_at = now()
      WHERE id = _call_id;
    RETURN jsonb_build_object('ok', true, 'side', 'caller');
  ELSIF _uid = _row.host_id THEN
    UPDATE public.private_calls
      SET host_rating = _rating, updated_at = now()
      WHERE id = _call_id;
    RETURN jsonb_build_object('ok', true, 'side', 'host');
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_call_rating(uuid, integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_call_rating(uuid, integer) FROM anon, public;
