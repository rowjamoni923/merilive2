-- Fix overloaded Face Verification stats RPC ambiguity.
-- The previous text overload had DEFAULT NULL while a zero-argument overload also existed,
-- so PostgREST/SQL could not choose the correct function when the admin UI called it with no args.

DROP FUNCTION IF EXISTS public.admin_face_verification_stats(text);

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats(_search text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r jsonb;
  v_q text;
BEGIN
  IF NOT public.is_active_admin_session() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_q := NULLIF(trim(coalesce(_search, '')), '');

  WITH scoped AS (
    SELECT
      public.face_verification_status_bucket(s.status) AS status_bucket,
      public.face_verification_is_auto_reviewed(s.status, s.admin_notes) AS is_auto_reviewed,
      lower(trim(coalesce(s.status, ''))) AS raw_status
    FROM public.face_verification_submissions s
    LEFT JOIN public.profiles p ON p.id = s.user_id
    WHERE (
      v_q IS NULL
      OR p.display_name ILIKE '%' || v_q || '%'
      OR p.app_uid ILIKE '%' || v_q || '%'
      OR s.full_name ILIKE '%' || v_q || '%'
      OR s.user_id::text ILIKE v_q || '%'
    )
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'submitted', count(*) FILTER (WHERE raw_status = 'submitted'),
    'under_review', count(*) FILTER (WHERE raw_status = 'under_review'),
    'approved', count(*) FILTER (WHERE status_bucket = 'approved'),
    'rejected', count(*) FILTER (WHERE status_bucket = 'rejected'),
    'auto_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND is_auto_reviewed),
    'auto_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND is_auto_reviewed),
    'manual_pending', count(*) FILTER (WHERE status_bucket = 'pending'),
    'manual_approved', count(*) FILTER (WHERE status_bucket = 'approved' AND NOT is_auto_reviewed),
    'manual_rejected', count(*) FILTER (WHERE status_bucket = 'rejected' AND NOT is_auto_reviewed),
    'manual_total', count(*) FILTER (WHERE status_bucket = 'pending' OR NOT is_auto_reviewed),
    'total', count(*)
  ) INTO r FROM scoped;

  RETURN coalesce(r, jsonb_build_object(
    'pending', 0,
    'submitted', 0,
    'under_review', 0,
    'approved', 0,
    'rejected', 0,
    'auto_approved', 0,
    'auto_rejected', 0,
    'manual_pending', 0,
    'manual_approved', 0,
    'manual_rejected', 0,
    'manual_total', 0,
    'total', 0
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_face_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_face_verification_stats(NULL::text);
$$;

REVOKE ALL ON FUNCTION public.admin_face_verification_stats(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_face_verification_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_face_verification_stats() TO anon, authenticated;