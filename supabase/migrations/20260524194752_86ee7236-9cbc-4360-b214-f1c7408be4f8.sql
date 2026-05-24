
-- 1. Drop the direct INSERT policy that allowed free self-grants
DROP POLICY IF EXISTS u_ins_bg ON public.user_purchased_backgrounds;

-- 2. Secure purchase RPC for party backgrounds
CREATE OR REPLACE FUNCTION public.purchase_party_background(_background_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _user_id uuid;
  _bg RECORD;
  _price int;
  _already boolean;
  _deduct jsonb;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  SELECT * INTO _bg
  FROM public.party_room_backgrounds
  WHERE id = _background_id AND COALESCE(is_active, true) = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Background not found');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.user_purchased_backgrounds
    WHERE user_id = _user_id AND background_id = _background_id AND is_active = true
  ) INTO _already;

  IF _already THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already owned');
  END IF;

  _price := COALESCE(_bg.price_diamonds, _bg.price_coins, 0);

  IF COALESCE(_bg.is_free, false) = false AND _price > 0 THEN
    _deduct := public.deduct_coins(_user_id, _price);
    IF NOT COALESCE((_deduct->>'success')::boolean, false) THEN
      RETURN jsonb_build_object('success', false, 'error', COALESCE(_deduct->>'error','Insufficient balance'));
    END IF;
  ELSE
    _price := 0;
  END IF;

  INSERT INTO public.user_purchased_backgrounds (user_id, background_id, price_paid, is_active)
  VALUES (_user_id, _background_id, _price, true);

  RETURN jsonb_build_object(
    'success', true,
    'price_paid', _price,
    'new_balance', (_deduct->>'new_balance')::bigint
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purchase_party_background(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purchase_party_background(uuid) TO authenticated;

-- 3. Freeze immutable fields on user_purchases (only is_equipped may change)
CREATE OR REPLACE FUNCTION public.guard_user_purchases_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admin / service role can do anything
  IF is_active_admin_session()
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id       IS DISTINCT FROM OLD.user_id
     OR NEW.item_id    IS DISTINCT FROM OLD.item_id
     OR NEW.item_type  IS DISTINCT FROM OLD.item_type
     OR NEW.price_paid IS DISTINCT FROM OLD.price_paid
     OR NEW.currency_type IS DISTINCT FROM OLD.currency_type
     OR NEW.purchased_at  IS DISTINCT FROM OLD.purchased_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.is_active  IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Only is_equipped may be modified on user_purchases'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_purchases_update ON public.user_purchases;
CREATE TRIGGER trg_guard_user_purchases_update
  BEFORE UPDATE ON public.user_purchases
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_purchases_update();

-- 4. Freeze immutable fields on user_role_frames (only is_equipped/equipped may change)
CREATE OR REPLACE FUNCTION public.guard_user_role_frames_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF is_active_admin_session()
     OR has_role(auth.uid(), 'admin')
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id      IS DISTINCT FROM OLD.user_id
     OR NEW.frame_id  IS DISTINCT FROM OLD.frame_id
     OR NEW.role_type IS DISTINCT FROM OLD.role_type
     OR NEW.source_table IS DISTINCT FROM OLD.source_table
     OR NEW.purchased_at IS DISTINCT FROM OLD.purchased_at
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.assigned_at IS DISTINCT FROM OLD.assigned_at
     OR NEW.notes IS DISTINCT FROM OLD.notes THEN
    RAISE EXCEPTION 'Only is_equipped/equipped may be modified on user_role_frames'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_role_frames_update ON public.user_role_frames;
CREATE TRIGGER trg_guard_user_role_frames_update
  BEFORE UPDATE ON public.user_role_frames
  FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_frames_update();
