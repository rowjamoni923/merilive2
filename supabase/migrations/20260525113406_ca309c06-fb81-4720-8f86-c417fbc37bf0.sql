-- Pkg335 pass-2: rate-limit follow/unfollow churn per user.
-- Cap: 30 inserts/min and 30 deletes/min per follower_id.
-- Existing guard_followers_insert handles self/banned/blocked rules; this is volume-only.

CREATE OR REPLACE FUNCTION public.tg_rate_limit_followers_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent integer;
BEGIN
  -- Allow service_role / admin bypass.
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.followers
  WHERE follower_id = NEW.follower_id
    AND created_at > now() - interval '1 minute';

  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'follow rate limit exceeded, please slow down'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rate_limit_followers_insert ON public.followers;
CREATE TRIGGER rate_limit_followers_insert
BEFORE INSERT ON public.followers
FOR EACH ROW
EXECUTE FUNCTION public.tg_rate_limit_followers_insert();

-- For unfollow churn we use a small audit table (insert-only, auto-pruned) since
-- a delete trigger cannot count past deletions of the same row.
CREATE TABLE IF NOT EXISTS public.followers_unfollow_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  unfollowed_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followers_unfollow_audit_recent
  ON public.followers_unfollow_audit(follower_id, created_at DESC);

ALTER TABLE public.followers_unfollow_audit ENABLE ROW LEVEL SECURITY;
-- No client policies: only triggers (SECURITY DEFINER) write/read.
REVOKE ALL ON public.followers_unfollow_audit FROM anon, authenticated, PUBLIC;

CREATE OR REPLACE FUNCTION public.tg_rate_limit_followers_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent integer;
BEGIN
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_recent
  FROM public.followers_unfollow_audit
  WHERE follower_id = OLD.follower_id
    AND created_at > now() - interval '1 minute';

  IF v_recent >= 30 THEN
    RAISE EXCEPTION 'unfollow rate limit exceeded, please slow down'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.followers_unfollow_audit (follower_id, unfollowed_id)
  VALUES (OLD.follower_id, OLD.following_id);

  -- Best-effort prune (keep table tiny): drop rows older than 10 minutes.
  DELETE FROM public.followers_unfollow_audit
   WHERE created_at < now() - interval '10 minutes';

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS rate_limit_followers_delete ON public.followers;
CREATE TRIGGER rate_limit_followers_delete
BEFORE DELETE ON public.followers
FOR EACH ROW
EXECUTE FUNCTION public.tg_rate_limit_followers_delete();