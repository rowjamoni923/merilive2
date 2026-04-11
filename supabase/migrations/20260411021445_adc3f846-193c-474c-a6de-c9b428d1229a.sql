-- Fix generate_app_uid to produce numbers-only UIDs (10 digits, zero-padded)
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
    -- Generate a 10-digit numeric UID (0000000000 - 9999999999)
    new_uid := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
    EXIT WHEN NOT uid_exists;
  END LOOP;
  RETURN new_uid;
END;
$$;

-- Fix existing letter-containing UIDs to numeric-only
DO $$
DECLARE
  rec RECORD;
  new_uid VARCHAR(10);
  uid_exists BOOLEAN;
BEGIN
  FOR rec IN SELECT id FROM public.profiles WHERE app_uid ~ '[a-zA-Z]'
  LOOP
    LOOP
      new_uid := lpad(floor(random() * 10000000000)::bigint::text, 10, '0');
      SELECT EXISTS(SELECT 1 FROM public.profiles WHERE app_uid = new_uid) INTO uid_exists;
      EXIT WHEN NOT uid_exists;
    END LOOP;
    UPDATE public.profiles SET app_uid = new_uid WHERE id = rec.id;
  END LOOP;
END;
$$;