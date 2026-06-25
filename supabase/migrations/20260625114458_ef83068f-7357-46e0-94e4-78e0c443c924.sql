
-- ============================================================
-- Phase 2: Weighted Matching Engine
-- ============================================================

-- 1) Score weights on settings (admin-tunable, single source of truth)
ALTER TABLE public.random_call_settings
  ADD COLUMN IF NOT EXISTS score_weight_verification NUMERIC NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS score_weight_vip          NUMERIC NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS score_weight_engagement   NUMERIC NOT NULL DEFAULT 0.20,
  ADD COLUMN IF NOT EXISTS score_weight_profile      NUMERIC NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS score_weight_level        NUMERIC NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS score_weight_history      NUMERIC NOT NULL DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS engagement_fresh_seconds  INT     NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS level_norm_cap            INT     NOT NULL DEFAULT 50;

-- 2) Helper: compute composite score (0..100) for a host vs a caller
CREATE OR REPLACE FUNCTION public.compute_host_match_score(
  p_host_id   UUID,
  p_caller_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_s        RECORD;
  v_p        RECORD;
  v_st       RECORD;
  v_pref     RECORD;
  v_avail    RECORD;
  v_verif    NUMERIC := 0;
  v_vip      NUMERIC := 0;
  v_engage   NUMERIC := 0;
  v_profile  NUMERIC := 0;
  v_level    NUMERIC := 0;
  v_history  NUMERIC := 0;
  v_total    NUMERIC := 0;
  v_secs     NUMERIC;
BEGIN
  SELECT * INTO v_s FROM public.random_call_settings WHERE id = 1;
  SELECT id, is_face_verified, phone_verified, vip_tier, user_level, avatar_url, bio, gender
    INTO v_p FROM public.profiles WHERE id = p_host_id;
  IF v_p.id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO v_st    FROM public.host_match_stats          WHERE host_id = p_host_id;
  SELECT * INTO v_pref  FROM public.host_match_preferences    WHERE host_id = p_host_id;
  SELECT * INTO v_avail FROM public.host_match_availability   WHERE host_id = p_host_id;

  -- Verification (0..100): phone 25, face 50, generic verified 25
  v_verif := (CASE WHEN COALESCE(v_p.phone_verified,false)  THEN 25 ELSE 0 END)
           + (CASE WHEN COALESCE(v_p.is_face_verified,false) THEN 50 ELSE 0 END)
           + 25; -- baseline (account exists / passed sign-up)

  -- VIP (0..100): tier 0..10 mapped linearly, SVIP (tier>=5) gets full
  v_vip := LEAST(100, COALESCE(v_p.vip_tier,0) * 20);

  -- Engagement (0..100): recency of last_active_at vs engagement_fresh_seconds
  IF v_avail.last_active_at IS NOT NULL THEN
    v_secs := EXTRACT(EPOCH FROM (now() - v_avail.last_active_at));
    v_engage := GREATEST(0, LEAST(100, 100 - (v_secs / GREATEST(1, v_s.engagement_fresh_seconds)) * 100));
  END IF;

  -- Profile completion (0..100)
  v_profile := (CASE WHEN v_p.avatar_url IS NOT NULL AND length(v_p.avatar_url) > 0 THEN 40 ELSE 0 END)
             + (CASE WHEN v_p.bio        IS NOT NULL AND length(v_p.bio)        > 0 THEN 30 ELSE 0 END)
             + (CASE WHEN v_p.gender     IS NOT NULL AND length(v_p.gender)     > 0 THEN 30 ELSE 0 END);

  -- User level (0..100) normalized against cap
  v_level := LEAST(100, (COALESCE(v_p.user_level,0)::NUMERIC / GREATEST(1, v_s.level_norm_cap)) * 100);

  -- Historical quality (0..100): acceptance% * completion% * rating/5
  IF v_st.host_id IS NOT NULL THEN
    DECLARE
      acc      NUMERIC := COALESCE(v_st.acceptance_pct, 0);
      comp     NUMERIC := CASE WHEN COALESCE(v_st.calls_completed_7d,0) + COALESCE(v_st.calls_short_7d,0) > 0
                                THEN (v_st.calls_completed_7d::NUMERIC
                                      / (v_st.calls_completed_7d + v_st.calls_short_7d)) * 100
                                ELSE 60 END;
      rating   NUMERIC := COALESCE(v_st.avg_rating_7d, 4.0) / 5.0 * 100;
    BEGIN
      v_history := (acc * 0.4) + (comp * 0.3) + (rating * 0.3);
    END;
  ELSE
    v_history := 60; -- new host baseline
  END IF;

  v_total :=  v_verif   * v_s.score_weight_verification
            + v_vip     * v_s.score_weight_vip
            + v_engage  * v_s.score_weight_engagement
            + v_profile * v_s.score_weight_profile
            + v_level   * v_s.score_weight_level
            + v_history * v_s.score_weight_history;

  RETURN ROUND(v_total, 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_host_match_score(UUID, UUID) TO authenticated, service_role;

-- 3) Rewrite claim_match with filters + weighted score
CREATE OR REPLACE FUNCTION public.claim_match(p_caller_queue_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Lock caller row
  SELECT * INTO v_caller FROM public.random_call_queue
    WHERE id = p_caller_queue_id AND status = 'waiting'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT id, gender, user_level, vip_tier, region
    INTO v_caller_prof FROM public.profiles WHERE id = v_caller.user_id;

  -- Pick best-scoring eligible host
  WITH candidates AS (
    SELECT
      q.id            AS queue_id,
      q.user_id       AS host_id,
      q.preferred_country,
      q.preferred_langs,
      q.entered_at,
      a.is_available,
      a.preferred_caller_gender,
      a.accepts_countries,
      a.accepts_languages,
      a.suspended_until,
      p.is_in_match_pool,
      p.min_caller_level,
      p.blocked_user_ids,
      p.flash_disconnect_cooldown_until,
      s.is_queue_suppressed,
      public.compute_host_match_score(q.user_id, v_caller.user_id) AS composite
    FROM public.random_call_queue q
    LEFT JOIN public.host_match_availability  a ON a.host_id = q.user_id
    LEFT JOIN public.host_match_preferences   p ON p.host_id = q.user_id
    LEFT JOIN public.host_match_stats         s ON s.host_id = q.user_id
    WHERE q.role = 'host'
      AND q.status = 'waiting'
      AND q.user_id <> v_caller.user_id
      AND (a.is_available IS NULL OR a.is_available = true)
      AND (a.suspended_until IS NULL OR a.suspended_until < now())
      AND (p.is_in_match_pool IS NULL OR p.is_in_match_pool = true)
      AND (p.flash_disconnect_cooldown_until IS NULL OR p.flash_disconnect_cooldown_until < now())
      AND (s.is_queue_suppressed IS NULL OR s.is_queue_suppressed = false)
      AND (p.min_caller_level IS NULL OR COALESCE(v_caller_prof.user_level,0) >= p.min_caller_level)
      AND (p.blocked_user_ids IS NULL OR NOT (v_caller.user_id = ANY(p.blocked_user_ids)))
      -- Country filter (caller pref)
      AND (v_caller.preferred_country IS NULL
           OR q.preferred_country IS NULL
           OR q.preferred_country = v_caller.preferred_country)
      -- Country filter (host accepts list)
      AND (a.accepts_countries IS NULL
           OR cardinality(a.accepts_countries) = 0
           OR v_caller_prof.region IS NULL
           OR v_caller_prof.region = ANY(a.accepts_countries))
      -- Gender filter (host's preferred caller gender)
      AND (a.preferred_caller_gender IS NULL
           OR a.preferred_caller_gender = 'any'
           OR v_caller_prof.gender IS NULL
           OR v_caller_prof.gender = a.preferred_caller_gender)
      -- Same-pair block (30 min default)
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
$$;

-- 4) Queue resort tick: re-score all waiting hosts every 30s
CREATE OR REPLACE FUNCTION public.random_match_resort_queue()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_n INT := 0;
BEGIN
  UPDATE public.random_call_queue q
     SET score = COALESCE(public.compute_host_match_score(q.user_id, q.user_id), 0)::INT,
         updated_at = now()
   WHERE q.role = 'host'
     AND q.status = 'waiting';
  GET DIAGNOSTICS v_n = ROW_COUNT;

  -- Purge expired same-pair blocks (keep table small)
  DELETE FROM public.recent_match_pairs
   WHERE matched_at < now() - interval '2 hours';

  RETURN v_n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.random_match_resort_queue() TO service_role;

-- 5) Schedule resort every 30s (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('random_match_resort_30s');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'random_match_resort_30s',
  '30 seconds',
  $$ SELECT public.random_match_resort_queue(); $$
);
