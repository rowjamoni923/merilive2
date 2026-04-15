
-- Batch recalculate all user levels to fix stale data
DO $$
DECLARE
  _user_id uuid;
BEGIN
  FOR _user_id IN SELECT id FROM profiles LOOP
    PERFORM public.recalculate_user_level(_user_id);
  END LOOP;
END;
$$;
