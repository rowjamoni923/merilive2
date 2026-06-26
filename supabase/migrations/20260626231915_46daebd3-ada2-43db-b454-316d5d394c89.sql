-- Restrict random-call host pool to VERIFIED hosts only.
-- A "verified host" = profiles.is_host = true AND profiles.is_face_verified = true.
-- Female-gender accounts that haven't passed face verification must NOT receive random/private calls.

CREATE OR REPLACE FUNCTION public.get_online_global_hosts(p_caller_id uuid, p_limit integer DEFAULT 500)
 RETURNS TABLE(host_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.host_id
    FROM host_match_availability a
    LEFT JOIN host_match_stats s ON s.host_id = a.host_id
    JOIN profiles p ON p.id = a.host_id
   WHERE a.is_available = true
     AND a.host_id <> p_caller_id
     AND (a.suspended_until IS NULL OR a.suspended_until < now())
     AND (a.match_suspend_until IS NULL OR a.match_suspend_until < now())
     AND (s.random_reject_cooldown_until IS NULL OR s.random_reject_cooldown_until < now())
     AND (s.is_queue_suppressed IS NULL OR s.is_queue_suppressed = false)
     AND a.last_active_at > now() - interval '90 seconds'
     AND p.is_host = true
     AND p.is_face_verified = true
   ORDER BY a.last_active_at DESC
   LIMIT p_limit;
$function$;

CREATE OR REPLACE FUNCTION public.claim_match(p_caller_queue_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller        RECORD;
  v_caller_prof   RECORD;
  v_settings      RECORD;
  v_host_queue_id UUID;
  v_host_user_id  UUID;
  v_block_minutes INT;
BEGIN
  SELECT * INTO v_settings FROM public.random_call_settings WHERE id = 1;
  v_block_minutes := COALESCE(v_settings.same_pair_block_minutes, 30);

  SELECT * INTO v_caller FROM public.random_call_queue
    WHERE id = p_caller_queue_id AND status = 'waiting'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id, gender, user_level, vip_tier, region
    INTO v_caller_prof FROM public.profiles WHERE id = v_caller.user_id;

  WITH candidates AS (
    SELECT
      q.id            AS queue_id,
      q.user_id       AS host_id,
      q.entered_at,
      public.compute_host_match_score(q.user_id, v_caller.user_id) AS composite
    FROM public.random_call_queue q
    JOIN public.profiles                       hp ON hp.id      = q.user_id
    LEFT JOIN public.host_match_availability   a  ON a.host_id  = q.user_id
    LEFT JOIN public.host_match_preferences    p  ON p.host_id  = q.user_id
    LEFT JOIN public.host_match_stats          s  ON s.host_id  = q.user_id
    WHERE q.role = 'host'
      AND q.status = 'waiting'
      AND q.user_id <> v_caller.user_id
      AND hp.is_host = true
      AND hp.is_face_verified = true
      AND (a.is_available IS NULL OR a.is_available = true)
      AND (a.suspended_until IS NULL OR a.suspended_until < now())
      AND (p.is_in_match_pool IS NULL OR p.is_in_match_pool = true)
      AND (p.flash_disconnect_cooldown_until IS NULL OR p.flash_disconnect_cooldown_until < now())
      AND (s.is_queue_suppressed IS NULL OR s.is_queue_suppressed = false)
      AND (s.random_reject_cooldown_until IS NULL OR s.random_reject_cooldown_until < now())
      AND (p.min_caller_level IS NULL OR COALESCE(v_caller_prof.user_level,0) >= p.min_caller_level)
      AND (p.blocked_user_ids IS NULL OR NOT (v_caller.user_id = ANY(p.blocked_user_ids)))
      AND (v_caller.preferred_country IS NULL OR q.preferred_country IS NULL OR q.preferred_country = v_caller.preferred_country)
      AND (a.accepts_countries IS NULL OR cardinality(a.accepts_countries) = 0
           OR v_caller_prof.region IS NULL OR v_caller_prof.region = ANY(a.accepts_countries))
      AND (a.preferred_caller_gender IS NULL OR a.preferred_caller_gender = 'any'
           OR v_caller_prof.gender IS NULL OR v_caller_prof.gender = a.preferred_caller_gender)
      AND (v_caller.preferred_host_gender IS NULL OR v_caller.preferred_host_gender = 'any'
           OR hp.gender IS NULL OR hp.gender = v_caller.preferred_host_gender)
      AND NOT EXISTS (
        SELECT 1 FROM public.recent_match_pairs r
        WHERE r.user_a = LEAST(q.user_id, v_caller.user_id)
          AND r.user_b = GREATEST(q.user_id, v_caller.user_id)
          AND r.matched_at > now() - (v_block_minutes || ' minutes')::interval
      )
  )
  SELECT queue_id, host_id
    INTO v_host_queue_id, v_host_user_id
  FROM candidates
  ORDER BY composite DESC NULLS LAST, entered_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_host_queue_id IS NULL THEN RETURN NULL; END IF;

  UPDATE public.random_call_queue
    SET status = 'matched', matched_with = v_caller.user_id, updated_at = now()
    WHERE id = v_host_queue_id;
  UPDATE public.random_call_queue
    SET status = 'matched', matched_with = v_host_user_id, updated_at = now()
    WHERE id = p_caller_queue_id;

  INSERT INTO public.recent_match_pairs (user_a, user_b, matched_at)
  VALUES (LEAST(v_host_user_id, v_caller.user_id),
          GREATEST(v_host_user_id, v_caller.user_id),
          now())
  ON CONFLICT DO NOTHING;

  RETURN v_host_user_id;
END;
$function$;

-- Also restrict the avatar pool sampler used elsewhere to verified hosts only.
CREATE OR REPLACE FUNCTION public.get_random_pool_sample(_limit integer DEFAULT 6)
 RETURNS TABLE(avatar_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.avatar_url
    FROM public.random_call_queue q
    JOIN public.profiles p ON p.id = q.user_id
   WHERE q.role = 'host' AND q.status = 'waiting'
     AND p.avatar_url IS NOT NULL
     AND p.is_host = true
     AND p.is_face_verified = true
   ORDER BY q.entered_at DESC
   LIMIT GREATEST(1, LEAST(20, _limit));
$function$;