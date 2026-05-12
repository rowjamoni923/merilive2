-- Add updated_at + auto-touch trigger to admin-writable tables that lack it
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'daily_tasks','host_conversion_requests','level_animations','level_privileges',
    'limited_time_offers','party_rooms','rating_reward_claims','room_welcome_messages','support_messages'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END$$;

-- Drop old approve_rating_reward (wrong table + wrong param names) and replace with correct one
DROP FUNCTION IF EXISTS public.approve_rating_reward(uuid, uuid);

CREATE OR REPLACE FUNCTION public.approve_rating_reward(p_claim_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim   RECORD;
  v_gender  text;
  v_amount  bigint;
  v_type    text;
BEGIN
  IF NOT (public.is_admin(p_admin_id) OR public.is_active_admin_session()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT * INTO v_claim FROM public.rating_reward_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Claim not found');
  END IF;
  IF v_claim.status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already processed');
  END IF;

  SELECT lower(coalesce(gender, '')) INTO v_gender FROM public.profiles WHERE id = v_claim.user_id;

  IF v_gender = 'female' THEN
    v_amount := 10000;
    v_type   := 'beans';
    UPDATE public.profiles SET beans = COALESCE(beans, 0) + v_amount WHERE id = v_claim.user_id;
  ELSE
    v_amount := 5000;
    v_type   := 'diamonds';
    UPDATE public.profiles SET coins = COALESCE(coins, 0) + v_amount WHERE id = v_claim.user_id;
  END IF;

  UPDATE public.rating_reward_claims
     SET status        = 'approved',
         reviewed_by   = p_admin_id,
         reviewed_at   = now(),
         reward_type   = v_type,
         reward_amount = v_amount
   WHERE id = p_claim_id;

  RETURN jsonb_build_object('success', true, 'claim_id', p_claim_id, 'reward_type', v_type, 'reward_amount', v_amount);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_rating_reward(uuid, uuid) TO authenticated, anon;