DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT oid, pg_get_function_identity_arguments(oid) AS args
           FROM pg_proc WHERE proname = 'claim_daily_login_reward' LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(%s) TO anon', r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.claim_daily_login_reward(%s) TO authenticated', r.args);
  END LOOP;
END $$;