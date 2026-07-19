DO $$
DECLARE
  r record;
  v_newdef text;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) ~* '\m(coin|coins|coin_|coins_|coin_amount|coins_amount|coin_value|coin_cost|coins_spent|coins_per_minute)\M'
  LOOP
    v_newdef := r.def;

    -- Legacy spend-wallet column/key names that no longer exist in the live schema.
    v_newdef := regexp_replace(v_newdef, '\mcoins_amount\M', 'diamonds_amount', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOINS_AMOUNT\M', 'DIAMONDS_AMOUNT', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoin_amount\M', 'diamond_amount', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOIN_AMOUNT\M', 'DIAMOND_AMOUNT', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoin_value\M', 'diamond_value', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOIN_VALUE\M', 'DIAMOND_VALUE', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoin_cost\M', 'diamond_cost', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOIN_COST\M', 'DIAMOND_COST', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoins_spent\M', 'diamonds_spent', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOINS_SPENT\M', 'DIAMONDS_SPENT', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoins_per_minute\M', 'diamonds_per_minute', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOINS_PER_MINUTE\M', 'DIAMONDS_PER_MINUTE', 'g');

    -- Legacy table/identifier prefixes such as coin_packages / coin_transfers.
    v_newdef := regexp_replace(v_newdef, '\mcoin_', 'diamond_', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCoin_', 'Diamond_', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOIN_', 'DIAMOND_', 'g');

    -- User-facing / JSON / column references for the old spend wallet.
    v_newdef := regexp_replace(v_newdef, '\mcoins\M', 'diamonds', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCoins\M', 'Diamonds', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOINS\M', 'DIAMONDS', 'g');
    v_newdef := regexp_replace(v_newdef, '\mcoin\M', 'diamond', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCoin\M', 'Diamond', 'g');
    v_newdef := regexp_replace(v_newdef, '\mCOIN\M', 'DIAMOND', 'g');

    IF v_newdef IS DISTINCT FROM r.def THEN
      BEGIN
        EXECUTE v_newdef;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'Zero-Coin function rewrite failed for %: %', r.signature, SQLERRM;
      END;
    END IF;
  END LOOP;
END $$;

-- Hard patch the most visible purchase functions to remove any possible stale RETURNING/JSON leftovers.
CREATE OR REPLACE FUNCTION public.purchase_shop_item(_item_id uuid, _equip boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  _price := greatest(coalesce(nullif(_item.price_diamonds, 0), 0), 0);

  SELECT * INTO _profile
  FROM public.profiles
  WHERE id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF coalesce(_profile.diamonds, 0) < _price THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'insufficient_diamonds',
      'required', _price,
      'current', coalesce(_profile.diamonds, 0)
    );
  END IF;

  _expires_at := CASE
    WHEN coalesce(_item.is_permanent, false) OR _item.duration_days IS NULL THEN NULL
    ELSE now() + (_item.duration_days || ' days')::interval
  END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.bypass_user_purchase_guard', 'true', true);

  UPDATE public.profiles
  SET diamonds = coalesce(diamonds, 0) - _price,
      updated_at = now()
  WHERE id = _user_id
  RETURNING diamonds INTO _new_balance;

  INSERT INTO public.user_purchases (user_id, item_id, item_type, price_paid, currency_type, expires_at, is_active, is_equipped)
  VALUES (_user_id, _item.id, coalesce(_item.category, _item.item_type, 'shop_item'), _price, 'diamonds', _expires_at, true, _equip)
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
        WHEN lower(coalesce(si.category, '')) IN ('entrance','entrance_effect','entry_banner') THEN 'entrance'
        WHEN lower(coalesce(si.category, '')) IN ('entry_bar','entry_name_bar','entry_bar_effect') THEN 'entry_name_bar'
        WHEN lower(coalesce(si.category, '')) IN ('bubble','chat_bubble') THEN 'bubble'
        WHEN lower(coalesce(si.category, '')) IN ('vehicle','vehicle_entrance') THEN 'vehicle'
        WHEN lower(coalesce(si.category, '')) IN ('medal','badge','vip_medal') THEN 'medal'
        WHEN lower(coalesce(si.category, '')) = 'noble_card' THEN 'noble_card'
        ELSE lower(coalesce(si.category, ''))
      END
      = CASE
        WHEN lower(coalesce(_item.category, '')) IN ('frame','portrait_frame') THEN 'frame'
        WHEN lower(coalesce(_item.category, '')) IN ('entrance','entrance_effect','entry_banner') THEN 'entrance'
        WHEN lower(coalesce(_item.category, '')) IN ('entry_bar','entry_name_bar','entry_bar_effect') THEN 'entry_name_bar'
        WHEN lower(coalesce(_item.category, '')) IN ('bubble','chat_bubble') THEN 'bubble'
        WHEN lower(coalesce(_item.category, '')) IN ('vehicle','vehicle_entrance') THEN 'vehicle'
        WHEN lower(coalesce(_item.category, '')) IN ('medal','badge','vip_medal') THEN 'medal'
        WHEN lower(coalesce(_item.category, '')) = 'noble_card' THEN 'noble_card'
        ELSE lower(coalesce(_item.category, ''))
      END;

    _equip_updates := public._pkg311_profile_equip_update_for_shop_item(_profile, _item.id, _item.category);

    IF _equip_updates ? 'equipped_frame_id' THEN
      UPDATE public.profiles SET equipped_frame_id = (_equip_updates->>'equipped_frame_id')::uuid, previous_frame_id = COALESCE((_equip_updates->>'previous_frame_id')::uuid, previous_frame_id), updated_at = now() WHERE id = _user_id;
    ELSIF _equip_updates ? 'equipped_entrance_id' THEN
      UPDATE public.profiles SET equipped_entrance_id = (_equip_updates->>'equipped_entrance_id')::uuid, equipped_entry_banner_id = (_equip_updates->>'equipped_entry_banner_id')::uuid, previous_entrance_id = COALESCE((_equip_updates->>'previous_entrance_id')::uuid, previous_entrance_id), previous_entry_banner_id = COALESCE((_equip_updates->>'previous_entry_banner_id')::uuid, previous_entry_banner_id), updated_at = now() WHERE id = _user_id;
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
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _app_uid TEXT;
  _display_name TEXT;
  _gender TEXT;
  _is_host BOOLEAN;
  _host_status TEXT;
  _phone TEXT;
  _phone_verified BOOLEAN;
  _dial_code TEXT;
  _country_code TEXT;
  _country_name TEXT;
  _country_flag TEXT;
BEGIN
  LOOP
    _app_uid := 'U' || LPAD(FLOOR(RANDOM() * 99999999)::TEXT, 8, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE app_uid = _app_uid);
  END LOOP;

  _display_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'display_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    CASE WHEN NEW.email IS NOT NULL AND NEW.email !~ '@meri\.local$' THEN split_part(NEW.email, '@', 1) ELSE 'User' END
  );

  _gender := lower(NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'gender',
    NEW.raw_user_meta_data->>'selected_gender',
    CASE WHEN lower(COALESCE(NEW.raw_user_meta_data->>'account_type', NEW.raw_user_meta_data->>'profile_type', NEW.raw_user_meta_data->>'role', '')) IN ('host','female_host') THEN 'female' END
  )), ''));
  IF _gender NOT IN ('male', 'female') THEN _gender := 'male'; END IF;

  IF _gender = 'female' THEN
    _is_host := true;
    _host_status := 'pending_face';
  ELSE
    _is_host := false;
    _host_status := NULL;
  END IF;

  _phone := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone_number', '')), '');
  _phone_verified := COALESCE((NEW.raw_user_meta_data->>'phone_verified')::boolean, false);
  _dial_code := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'phone_dial_code', '')), '');
  _country_code := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'country_code', '')), '');
  _country_name := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'country_name', '')), '');
  _country_flag := NULLIF(BTRIM(COALESCE(NEW.raw_user_meta_data->>'country_flag', '')), '');

  PERFORM set_config('app.bypass_profile_protection', 'true', true);

  INSERT INTO public.profiles (
    id, app_uid, display_name, username, email, avatar_url,
    diamonds, beans, beans_balance, user_level, host_level,
    is_verified, is_face_verified, is_host, host_status, is_online,
    device_id, gender, is_deleted,
    phone_number, phone_verified,
    country_code, country_name, country_flag,
    signup_country_code, signup_country_name, signup_country_flag,
    created_at, updated_at, last_seen, last_seen_at
  ) VALUES (
    NEW.id, _app_uid, _display_name,
    CASE WHEN NEW.email IS NOT NULL AND NEW.email !~ '@meri\.local$' THEN split_part(NEW.email, '@', 1) ELSE NULL END,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''), NULLIF(NEW.raw_user_meta_data->>'picture', ''), ''),
    0, 0, 0, 1, 0,
    false, false, _is_host, _host_status, false,
    NULLIF(NEW.raw_user_meta_data->>'device_id', ''), _gender, false,
    _phone, _phone_verified,
    _country_code, _country_name, _country_flag,
    _country_code, _country_name, _country_flag,
    now(), now(), now(), now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    device_id = COALESCE(EXCLUDED.device_id, public.profiles.device_id),
    phone_number = COALESCE(public.profiles.phone_number, EXCLUDED.phone_number),
    phone_verified = COALESCE(NULLIF(public.profiles.phone_verified, false), EXCLUDED.phone_verified, public.profiles.phone_verified),
    country_code = COALESCE(public.profiles.country_code, EXCLUDED.country_code),
    country_name = COALESCE(public.profiles.country_name, EXCLUDED.country_name),
    country_flag = COALESCE(public.profiles.country_flag, EXCLUDED.country_flag),
    signup_country_code = COALESCE(public.profiles.signup_country_code, EXCLUDED.signup_country_code),
    signup_country_name = COALESCE(public.profiles.signup_country_name, EXCLUDED.signup_country_name),
    signup_country_flag = COALESCE(public.profiles.signup_country_flag, EXCLUDED.signup_country_flag),
    gender = CASE
      WHEN public.profiles.gender IS NULL OR public.profiles.gender NOT IN ('male','female') THEN EXCLUDED.gender
      ELSE public.profiles.gender
    END,
    is_host = CASE
      WHEN COALESCE(public.profiles.gender, EXCLUDED.gender) = 'female' THEN true
      WHEN COALESCE(public.profiles.gender, EXCLUDED.gender) = 'male' THEN false
      ELSE public.profiles.is_host
    END,
    host_status = CASE
      WHEN COALESCE(public.profiles.gender, EXCLUDED.gender) = 'female' THEN
        CASE
          WHEN public.profiles.host_status IN ('blocked','rejected') THEN public.profiles.host_status
          WHEN public.profiles.is_face_verified IS TRUE THEN 'approved'
          ELSE 'pending_face'
        END
      ELSE NULL
    END,
    updated_at = now();

  PERFORM set_config('app.bypass_profile_protection', 'false', true);
  RETURN NEW;
END;
$function$;