-- Pkg311 pass-3: server-authoritative privilege/shop purchases and immutable purchase rows

CREATE OR REPLACE FUNCTION public._pkg311_profile_equip_update_for_shop_item(
  _profile public.profiles,
  _item_id uuid,
  _category text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updates jsonb := '{}'::jsonb;
  _slot text := lower(coalesce(_category, ''));
BEGIN
  IF _slot IN ('frame', 'portrait_frame') THEN
    _updates := _updates || jsonb_build_object('equipped_frame_id', _item_id);
    IF _profile.equipped_frame_id IS NOT NULL AND _profile.equipped_frame_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_frame_id', _profile.equipped_frame_id);
    END IF;
  ELSIF _slot IN ('entrance', 'entrance_effect') THEN
    _updates := _updates || jsonb_build_object('equipped_entrance_id', _item_id);
    IF _profile.equipped_entrance_id IS NOT NULL AND _profile.equipped_entrance_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_entrance_id', _profile.equipped_entrance_id);
    END IF;
  ELSIF _slot IN ('entry_bar', 'entry_name_bar') THEN
    _updates := _updates || jsonb_build_object('equipped_entry_name_bar_id', _item_id);
    IF _profile.equipped_entry_name_bar_id IS NOT NULL AND _profile.equipped_entry_name_bar_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_entry_name_bar_id', _profile.equipped_entry_name_bar_id);
    END IF;
  ELSIF _slot IN ('bubble', 'chat_bubble') THEN
    _updates := _updates || jsonb_build_object('equipped_bubble_id', _item_id);
    IF _profile.equipped_bubble_id IS NOT NULL AND _profile.equipped_bubble_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_bubble_id', _profile.equipped_bubble_id);
    END IF;
  ELSIF _slot IN ('vehicle', 'vehicle_entrance') THEN
    _updates := _updates || jsonb_build_object('equipped_vehicle_id', _item_id);
    IF _profile.equipped_vehicle_id IS NOT NULL AND _profile.equipped_vehicle_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_vehicle_id', _profile.equipped_vehicle_id);
    END IF;
  ELSIF _slot = 'medal' THEN
    _updates := _updates || jsonb_build_object('equipped_medal_id', _item_id);
    IF _profile.equipped_medal_id IS NOT NULL AND _profile.equipped_medal_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_medal_id', _profile.equipped_medal_id);
    END IF;
  ELSIF _slot = 'noble_card' THEN
    _updates := _updates || jsonb_build_object('equipped_noble_card_id', _item_id);
    IF _profile.equipped_noble_card_id IS NOT NULL AND _profile.equipped_noble_card_id IS DISTINCT FROM _item_id THEN
      _updates := _updates || jsonb_build_object('previous_noble_card_id', _profile.equipped_noble_card_id);
    END IF;
  END IF;

  RETURN _updates;
END;
$$;

CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id uuid, _equip boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _item public.shop_items%ROWTYPE;
  _profile public.profiles%ROWTYPE;
  _price integer;
  _expires_at timestamptz;
  _purchase_id uuid;
  _equip_updates jsonb;
  _new_balance bigint;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT * INTO _item
  FROM public.shop_items
  WHERE id = _item_id AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'item_not_found');
  END IF;

  _price := greatest(coalesce(_item.price_diamonds, _item.price_coins, 0), 0);

  SELECT * INTO _profile
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF coalesce(_profile.coins, 0) < _price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_diamonds',
      'required', _price,
      'current', coalesce(_profile.coins, 0)
    );
  END IF;

  _expires_at := CASE
    WHEN coalesce(_item.is_permanent, false) OR _item.duration_days IS NULL THEN NULL
    ELSE now() + (_item.duration_days || ' days')::interval
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  UPDATE public.profiles
  SET coins = coalesce(coins, 0) - _price,
      updated_at = now()
  WHERE id = _user_id
  RETURNING coins INTO _new_balance;

  INSERT INTO public.user_purchases (
    user_id, item_id, item_type, price_paid, currency_type, expires_at, is_active, is_equipped
  ) VALUES (
    _user_id, _item.id, coalesce(_item.category, _item.item_type, 'shop_item'), _price, 'coins', _expires_at, true, _equip
  )
  RETURNING id INTO _purchase_id;

  IF _equip THEN
    UPDATE public.user_purchases up
    SET is_equipped = false
    FROM public.shop_items si
    WHERE up.user_id = _user_id
      AND up.id <> _purchase_id
      AND up.is_active = true
      AND si.id = up.item_id
      AND CASE
        WHEN lower(coalesce(si.category, '')) IN ('frame','portrait_frame') THEN 'frame'
        WHEN lower(coalesce(si.category, '')) IN ('entrance','entrance_effect') THEN 'entrance'
        WHEN lower(coalesce(si.category, '')) IN ('entry_bar','entry_name_bar') THEN 'entry_name_bar'
        WHEN lower(coalesce(si.category, '')) IN ('bubble','chat_bubble') THEN 'bubble'
        WHEN lower(coalesce(si.category, '')) IN ('vehicle','vehicle_entrance') THEN 'vehicle'
        WHEN lower(coalesce(si.category, '')) = 'medal' THEN 'medal'
        WHEN lower(coalesce(si.category, '')) = 'noble_card' THEN 'noble_card'
        ELSE lower(coalesce(si.category, ''))
      END = CASE
        WHEN lower(coalesce(_item.category, '')) IN ('frame','portrait_frame') THEN 'frame'
        WHEN lower(coalesce(_item.category, '')) IN ('entrance','entrance_effect') THEN 'entrance'
        WHEN lower(coalesce(_item.category, '')) IN ('entry_bar','entry_name_bar') THEN 'entry_name_bar'
        WHEN lower(coalesce(_item.category, '')) IN ('bubble','chat_bubble') THEN 'bubble'
        WHEN lower(coalesce(_item.category, '')) IN ('vehicle','vehicle_entrance') THEN 'vehicle'
        WHEN lower(coalesce(_item.category, '')) = 'medal' THEN 'medal'
        WHEN lower(coalesce(_item.category, '')) = 'noble_card' THEN 'noble_card'
        ELSE lower(coalesce(_item.category, ''))
      END;

    _equip_updates := public._pkg311_profile_equip_update_for_shop_item(_profile, _item.id, _item.category);

    IF _equip_updates ? 'equipped_frame_id' THEN
      UPDATE public.profiles SET equipped_frame_id = (_equip_updates->>'equipped_frame_id')::uuid, previous_frame_id = COALESCE((_equip_updates->>'previous_frame_id')::uuid, previous_frame_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_entrance_id' THEN
      UPDATE public.profiles SET equipped_entrance_id = (_equip_updates->>'equipped_entrance_id')::uuid, previous_entrance_id = COALESCE((_equip_updates->>'previous_entrance_id')::uuid, previous_entrance_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_entry_name_bar_id' THEN
      UPDATE public.profiles SET equipped_entry_name_bar_id = (_equip_updates->>'equipped_entry_name_bar_id')::uuid, previous_entry_name_bar_id = COALESCE((_equip_updates->>'previous_entry_name_bar_id')::uuid, previous_entry_name_bar_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_bubble_id' THEN
      UPDATE public.profiles SET equipped_bubble_id = (_equip_updates->>'equipped_bubble_id')::uuid, previous_bubble_id = COALESCE((_equip_updates->>'previous_bubble_id')::uuid, previous_bubble_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_vehicle_id' THEN
      UPDATE public.profiles SET equipped_vehicle_id = (_equip_updates->>'equipped_vehicle_id')::uuid, previous_vehicle_id = COALESCE((_equip_updates->>'previous_vehicle_id')::uuid, previous_vehicle_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_medal_id' THEN
      UPDATE public.profiles SET equipped_medal_id = (_equip_updates->>'equipped_medal_id')::uuid, previous_medal_id = COALESCE((_equip_updates->>'previous_medal_id')::uuid, previous_medal_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_noble_card_id' THEN
      UPDATE public.profiles SET equipped_noble_card_id = (_equip_updates->>'equipped_noble_card_id')::uuid, previous_noble_card_id = COALESCE((_equip_updates->>'previous_noble_card_id')::uuid, previous_noble_card_id), updated_at = now() WHERE id = _user_id;
    END IF;
  END IF;

  UPDATE public.shop_items
  SET total_sold = coalesce(total_sold, 0) + 1,
      updated_at = now()
  WHERE id = _item.id;

  RETURN jsonb_build_object(
    'success', true,
    'purchase_id', _purchase_id,
    'item_id', _item.id,
    'item_type', coalesce(_item.category, _item.item_type, 'shop_item'),
    'price_charged', _price,
    'balance_after', _new_balance,
    'expires_at', _expires_at,
    'is_equipped', _equip
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_user_purchases_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _trusted boolean := current_setting('request.jwt.claim.role', true) = 'service_role'
    OR public.is_admin(auth.uid())
    OR public.is_active_admin_session()
    OR COALESCE(current_setting('app.bypass_user_purchase_guard', true), 'false') = 'true';
BEGIN
  IF _trusted THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'direct user_purchases insert forbidden; use purchase_shop_item' USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.item_id IS DISTINCT FROM OLD.item_id
    OR NEW.item_type IS DISTINCT FROM OLD.item_type
    OR NEW.price_paid IS DISTINCT FROM OLD.price_paid
    OR NEW.currency_type IS DISTINCT FROM OLD.currency_type
    OR NEW.purchased_at IS DISTINCT FROM OLD.purchased_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'user_purchases immutable fields cannot be changed' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_purchases_integrity ON public.user_purchases;
CREATE TRIGGER trg_guard_user_purchases_integrity
BEFORE INSERT OR UPDATE ON public.user_purchases
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_purchases_integrity();

DROP POLICY IF EXISTS "Users can create purchases" ON public.user_purchases;
DROP POLICY IF EXISTS "Users can insert own purchases" ON public.user_purchases;
CREATE POLICY "Admins can create purchases"
ON public.user_purchases
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.is_active_admin_session());

REVOKE EXECUTE ON FUNCTION public._pkg311_profile_equip_update_for_shop_item(public.profiles, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_user_purchases_integrity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purchase_shop_item(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(uuid, boolean) TO authenticated;
