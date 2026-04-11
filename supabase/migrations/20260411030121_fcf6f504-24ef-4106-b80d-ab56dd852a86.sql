ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS host_photos TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS verification_type TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_is_banned ON public.profiles (is_banned);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen ON public.profiles (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_app_uid ON public.profiles (app_uid);
CREATE INDEX IF NOT EXISTS idx_profiles_device_id ON public.profiles (device_id);

ALTER TABLE public.daily_login_claims
  ADD COLUMN IF NOT EXISTS claimed_date DATE DEFAULT CURRENT_DATE;

UPDATE public.daily_login_claims
SET claimed_date = COALESCE(claimed_date, (claimed_at AT TIME ZONE 'UTC')::date)
WHERE claimed_date IS NULL;

ALTER TABLE public.daily_login_claims
  ALTER COLUMN claimed_date SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_daily_login_claims_user_claimed_date
  ON public.daily_login_claims (user_id, claimed_date DESC);

ALTER TABLE public.daily_login_rewards_config
  ADD COLUMN IF NOT EXISTS reward_coins INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_diamonds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_label TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'daily_login_rewards_config'
      AND column_name = 'reward_amount'
  ) THEN
    UPDATE public.daily_login_rewards_config
    SET reward_coins = COALESCE(NULLIF(reward_coins, 0), COALESCE(reward_amount, 0)::integer)
    WHERE reward_coins = 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.generate_app_uid()
RETURNS VARCHAR
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_uid VARCHAR(10);
  uid_exists BOOLEAN;
BEGIN
  LOOP
    new_uid := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
    EXIT WHEN NOT uid_exists;
  END LOOP;
  RETURN new_uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profile_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  candidate_name TEXT;
  candidate_email TEXT;
BEGIN
  candidate_name := NULLIF(btrim(COALESCE(NEW.display_name, '')), '');

  IF candidate_name IS NULL OR lower(candidate_name) IN ('user', 'owner') THEN
    candidate_name := NULLIF(btrim(COALESCE(to_jsonb(NEW) ->> 'username', '')), '');
  END IF;

  IF candidate_name IS NULL OR lower(candidate_name) IN ('user', 'owner') THEN
    candidate_email := NULLIF(btrim(COALESCE(to_jsonb(NEW) ->> 'email', '')), '');
    IF candidate_email IS NOT NULL AND position('@' IN candidate_email) > 1 THEN
      candidate_name := split_part(candidate_email, '@', 1);
    END IF;
  END IF;

  IF candidate_name IS NULL OR lower(candidate_name) IN ('user', 'owner') THEN
    candidate_name := 'User';
  END IF;

  NEW.display_name := candidate_name;
  NEW.app_uid := CASE
    WHEN NEW.app_uid IS NULL OR NEW.app_uid !~ '^\d{10}$' THEN public.generate_app_uid()
    ELSE NEW.app_uid
  END;
  NEW.is_banned := COALESCE(NEW.is_banned, false);
  NEW.last_seen := COALESCE(NEW.last_seen, now());

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'normalize_profile_identity_before_write'
      AND tgrelid = 'public.profiles'::regclass
  ) THEN
    CREATE TRIGGER normalize_profile_identity_before_write
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.normalize_profile_identity();
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET display_name = COALESCE(
        NULLIF(btrim(username), ''),
        CASE
          WHEN email IS NOT NULL AND position('@' IN email) > 1 THEN split_part(email, '@', 1)
          ELSE NULL
        END,
        display_name
      )
      WHERE display_name IS NULL
         OR btrim(display_name) = ''
         OR lower(btrim(display_name)) IN ('user', 'owner')
    $sql$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
  ) THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET display_name = NULLIF(btrim(username), '')
      WHERE (display_name IS NULL OR btrim(display_name) = '' OR lower(btrim(display_name)) IN ('user', 'owner'))
        AND username IS NOT NULL
        AND btrim(username) <> ''
    $sql$;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'email'
  ) THEN
    EXECUTE $sql$
      UPDATE public.profiles
      SET display_name = split_part(email, '@', 1)
      WHERE (display_name IS NULL OR btrim(display_name) = '' OR lower(btrim(display_name)) IN ('user', 'owner'))
        AND email IS NOT NULL
        AND position('@' IN email) > 1
    $sql$;
  END IF;
END $$;

DO $$
DECLARE
  rec RECORD;
  new_uid VARCHAR(10);
  uid_exists BOOLEAN;
BEGIN
  FOR rec IN
    SELECT id
    FROM public.profiles
    WHERE app_uid IS NULL OR app_uid !~ '^\d{10}$'
  LOOP
    LOOP
      new_uid := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
      EXIT WHEN NOT uid_exists;
    END LOOP;

    UPDATE public.profiles
    SET app_uid = new_uid
    WHERE id = rec.id;
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can create own profile'
  ) THEN
    CREATE POLICY "Users can create own profile"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);
  END IF;
END $$;