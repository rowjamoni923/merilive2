
-- FIX 1: SECURITY DEFINER Views
ALTER VIEW public.agencies_public SET (security_invoker = true);
ALTER VIEW public.profiles_public SET (security_invoker = true);

-- FIX 3: Remove redundant policy
DROP POLICY IF EXISTS "a_read_lg_bets" ON public.live_game_bets;

-- FIX 4: Function search_path (correct signatures - no args)
ALTER FUNCTION public.check_notification_preference() SET search_path = public;
ALTER FUNCTION public.notify_on_incoming_call() SET search_path = public;
ALTER FUNCTION public.notify_on_missed_call() SET search_path = public;
ALTER FUNCTION public.notify_on_shop_purchase() SET search_path = public;

-- FIX 2: Party room password verification function
CREATE OR REPLACE FUNCTION public.verify_party_room_password(_room_id uuid, _password text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_rooms
    WHERE id = _room_id
      AND (password IS NULL OR password = '' OR password = _password)
      AND is_active = true
  );
$$;

-- Revoke direct password column access
REVOKE SELECT (password) ON public.party_rooms FROM anon;
REVOKE SELECT (password) ON public.party_rooms FROM authenticated;
