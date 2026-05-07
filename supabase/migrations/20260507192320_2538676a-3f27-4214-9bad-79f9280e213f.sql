-- Section 11 — Shop: entry_effects & chat_bubbles catalogs, gift_items view, unified purchase_shop_item RPC.

ALTER TABLE public.user_role_frames
  DROP CONSTRAINT IF EXISTS user_role_frames_frame_id_fkey;

ALTER TABLE public.avatar_frames
  ADD COLUMN IF NOT EXISTS svga_url text,
  ADD COLUMN IF NOT EXISTS lottie_url text,
  ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT 30;

ALTER TABLE public.role_frames
  ADD COLUMN IF NOT EXISTS price_diamonds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_days integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS svga_url text,
  ADD COLUMN IF NOT EXISTS lottie_url text;

ALTER TABLE public.gifts
  ADD COLUMN IF NOT EXISTS tier integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS price_diamonds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_days integer,
  ADD COLUMN IF NOT EXISTS preview_url text,
  ADD COLUMN IF NOT EXISTS lottie_url text;

CREATE OR REPLACE VIEW public.gift_items AS
SELECT * FROM public.gifts;

GRANT SELECT ON public.gift_items TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.entry_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  svga_url text,
  lottie_url text,
  preview_url text,
  price_diamonds integer NOT NULL DEFAULT 0,
  duration_days integer DEFAULT 30,
  min_level integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.entry_effects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS entry_effects_public_read_active ON public.entry_effects;
CREATE POLICY entry_effects_public_read_active
  ON public.entry_effects FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS entry_effects_admin_all ON public.entry_effects;
CREATE POLICY entry_effects_admin_all
  ON public.entry_effects FOR ALL TO authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.chat_bubbles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  svga_url text,
  lottie_url text,
  preview_url text,
  price_diamonds integer NOT NULL DEFAULT 0,
  duration_days integer DEFAULT 30,
  min_level integer NOT NULL DEFAULT 0,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_bubbles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_bubbles_public_read_active ON public.chat_bubbles;
CREATE POLICY chat_bubbles_public_read_active
  ON public.chat_bubbles FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS chat_bubbles_admin_all ON public.chat_bubbles;
CREATE POLICY chat_bubbles_admin_all
  ON public.chat_bubbles FOR ALL TO authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.user_entry_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effect_id uuid NOT NULL REFERENCES public.entry_effects(id) ON DELETE CASCADE,
  is_equipped boolean NOT NULL DEFAULT false,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (user_id, effect_id)
);
ALTER TABLE public.user_entry_effects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_entry_effects_select_own ON public.user_entry_effects;
CREATE POLICY user_entry_effects_select_own
  ON public.user_entry_effects FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_entry_effects_admin_all ON public.user_entry_effects;
CREATE POLICY user_entry_effects_admin_all
  ON public.user_entry_effects FOR ALL TO authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.user_chat_bubbles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bubble_id uuid NOT NULL REFERENCES public.chat_bubbles(id) ON DELETE CASCADE,
  is_equipped boolean NOT NULL DEFAULT false,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (user_id, bubble_id)
);
ALTER TABLE public.user_chat_bubbles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_chat_bubbles_select_own ON public.user_chat_bubbles;
CREATE POLICY user_chat_bubbles_select_own
  ON public.user_chat_bubbles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_chat_bubbles_admin_all ON public.user_chat_bubbles;
CREATE POLICY user_chat_bubbles_admin_all
  ON public.user_chat_bubbles FOR ALL TO authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE TABLE IF NOT EXISTS public.user_gift_shop_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gift_id uuid NOT NULL REFERENCES public.gifts(id) ON DELETE CASCADE,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (user_id, gift_id)
);
ALTER TABLE public.user_gift_shop_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_gift_shop_ent_select_own ON public.user_gift_shop_entitlements;
CREATE POLICY user_gift_shop_ent_select_own
  ON public.user_gift_shop_entitlements FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_gift_shop_ent_admin_all ON public.user_gift_shop_entitlements;
CREATE POLICY user_gift_shop_ent_admin_all
  ON public.user_gift_shop_entitlements FOR ALL TO authenticated
  USING (public.is_active_admin_session())
  WITH CHECK (public.is_active_admin_session());

CREATE INDEX IF NOT EXISTS idx_entry_effects_active ON public.entry_effects (is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_chat_bubbles_active ON public.chat_bubbles (is_active, display_order);

DROP TRIGGER IF EXISTS tr_auto_equip_role_frame_bi ON public.user_role_frames;
CREATE TRIGGER tr_auto_equip_role_frame_bi
  BEFORE INSERT ON public.user_role_frames
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_equip_role_frame();

CREATE OR REPLACE FUNCTION public.auto_equip_entry_effect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $fn$
DECLARE
  v_active boolean;
  v_prev uuid;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  SELECT is_active INTO v_active FROM public.entry_effects WHERE id = NEW.effect_id;
  IF v_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;
  NEW.is_equipped := true;
  UPDATE public.user_entry_effects u
     SET is_equipped = false
   WHERE u.user_id = NEW.user_id
     AND u.effect_id IS DISTINCT FROM NEW.effect_id;
  SELECT equipped_entrance_id INTO v_prev FROM public.profiles WHERE id = NEW.user_id;
  UPDATE public.profiles p
     SET previous_entrance_id = CASE
           WHEN v_prev IS NOT NULL AND v_prev <> NEW.effect_id THEN v_prev
           ELSE p.previous_entrance_id
         END,
         equipped_entrance_id = NEW.effect_id
   WHERE p.id = NEW.user_id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tr_auto_equip_entry_effect_bi ON public.user_entry_effects;
CREATE TRIGGER tr_auto_equip_entry_effect_bi
  BEFORE INSERT ON public.user_entry_effects
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_equip_entry_effect();

CREATE OR REPLACE FUNCTION public.auto_equip_chat_bubble_shop()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $fn$
DECLARE
  v_active boolean;
  v_prev uuid;
BEGIN
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  SELECT is_active INTO v_active FROM public.chat_bubbles WHERE id = NEW.bubble_id;
  IF v_active IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;
  NEW.is_equipped := true;
  UPDATE public.user_chat_bubbles u
     SET is_equipped = false
   WHERE u.user_id = NEW.user_id
     AND u.bubble_id IS DISTINCT FROM NEW.bubble_id;
  SELECT equipped_bubble_id INTO v_prev FROM public.profiles WHERE id = NEW.user_id;
  UPDATE public.profiles p
     SET previous_bubble_id = CASE
           WHEN v_prev IS NOT NULL AND v_prev <> NEW.bubble_id THEN v_prev
           ELSE p.previous_bubble_id
         END,
         equipped_bubble_id = NEW.bubble_id
   WHERE p.id = NEW.user_id;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS tr_auto_equip_chat_bubble_bi ON public.user_chat_bubbles;
CREATE TRIGGER tr_auto_equip_chat_bubble_bi
  BEFORE INSERT ON public.user_chat_bubbles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_equip_chat_bubble_shop();

CREATE OR REPLACE FUNCTION public.purchase_shop_item(
  p_item_type text,
  p_item_id uuid,
  p_duration_days integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $fn$
DECLARE
  uid uuid := auth.uid();
  v_type text := lower(trim(coalesce(p_item_type, '')));
  v_level int;
  v_coins int;
  v_price int := 0;
  v_min_lv int := 0;
  v_dur int;
  v_exp timestamptz;
  dup boolean;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authenticated');
  END IF;

  SELECT COALESCE(user_level, 1), COALESCE(coins, 0)
    INTO v_level, v_coins
  FROM public.profiles
  WHERE id = uid
  FOR UPDATE;

  IF v_coins IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_not_found');
  END IF;

  IF v_type = 'avatar_frame' THEN
    SELECT
      COALESCE(NULLIF(price_diamonds, 0), 0),
      COALESCE(NULLIF(min_level, 0), NULLIF(level_required, 0), 0),
      COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
    INTO v_price, v_min_lv, v_dur
    FROM public.avatar_frames
    WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'item_not_found');
    END IF;
    IF v_level < v_min_lv THEN
      RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.user_role_frames ur
      WHERE ur.user_id = uid AND ur.frame_id = p_item_id
        AND COALESCE(ur.source_table, 'role_frames') = 'avatar_frames'
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ) INTO dup;
    IF dup THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_owned');
    END IF;
    DELETE FROM public.user_role_frames ur
    WHERE ur.user_id = uid AND ur.frame_id = p_item_id
      AND COALESCE(ur.source_table, 'role_frames') = 'avatar_frames'
      AND ur.expires_at IS NOT NULL AND ur.expires_at <= now();

  ELSIF v_type = 'role_frame' THEN
    SELECT
      COALESCE(NULLIF(price_diamonds, 0), 0),
      COALESCE(min_level, 0),
      COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
    INTO v_price, v_min_lv, v_dur
    FROM public.role_frames
    WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'item_not_found');
    END IF;
    IF v_level < v_min_lv THEN
      RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.user_role_frames ur
      WHERE ur.user_id = uid AND ur.frame_id = p_item_id
        AND COALESCE(ur.source_table, 'role_frames') = 'role_frames'
        AND (ur.expires_at IS NULL OR ur.expires_at > now())
    ) INTO dup;
    IF dup THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_owned');
    END IF;
    DELETE FROM public.user_role_frames ur
    WHERE ur.user_id = uid AND ur.frame_id = p_item_id
      AND COALESCE(ur.source_table, 'role_frames') = 'role_frames'
      AND ur.expires_at IS NOT NULL AND ur.expires_at <= now();

  ELSIF v_type = 'entry_effect' THEN
    SELECT
      COALESCE(NULLIF(price_diamonds, 0), 0),
      COALESCE(min_level, 0),
      COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
    INTO v_price, v_min_lv, v_dur
    FROM public.entry_effects
    WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'item_not_found');
    END IF;
    IF v_level < v_min_lv THEN
      RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.user_entry_effects e
      WHERE e.user_id = uid AND e.effect_id = p_item_id
        AND (e.expires_at IS NULL OR e.expires_at > now())
    ) INTO dup;
    IF dup THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_owned');
    END IF;
    DELETE FROM public.user_entry_effects e
    WHERE e.user_id = uid AND e.effect_id = p_item_id
      AND e.expires_at IS NOT NULL AND e.expires_at <= now();

  ELSIF v_type = 'chat_bubble' THEN
    SELECT
      COALESCE(NULLIF(price_diamonds, 0), 0),
      COALESCE(min_level, 0),
      COALESCE(p_duration_days, NULLIF(duration_days, 0), 30)
    INTO v_price, v_min_lv, v_dur
    FROM public.chat_bubbles
    WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'item_not_found');
    END IF;
    IF v_level < v_min_lv THEN
      RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.user_chat_bubbles c
      WHERE c.user_id = uid AND c.bubble_id = p_item_id
        AND (c.expires_at IS NULL OR c.expires_at > now())
    ) INTO dup;
    IF dup THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_owned');
    END IF;
    DELETE FROM public.user_chat_bubbles c
    WHERE c.user_id = uid AND c.bubble_id = p_item_id
      AND c.expires_at IS NOT NULL AND c.expires_at <= now();

  ELSIF v_type = 'gift_item' THEN
    SELECT
      COALESCE(NULLIF(price_diamonds, 0), 0),
      COALESCE(min_level, 0),
      COALESCE(p_duration_days, NULLIF(duration_days, 0), 365)
    INTO v_price, v_min_lv, v_dur
    FROM public.gifts
    WHERE id = p_item_id AND is_active = true;
    IF v_price IS NULL OR v_price <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'item_not_found_or_not_for_sale');
    END IF;
    IF v_level < v_min_lv THEN
      RETURN jsonb_build_object('success', false, 'error', 'level_required', 'min_level', v_min_lv);
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.user_gift_shop_entitlements g
      WHERE g.user_id = uid AND g.gift_id = p_item_id
        AND (g.expires_at IS NULL OR g.expires_at > now())
    ) INTO dup;
    IF dup THEN
      RETURN jsonb_build_object('success', false, 'error', 'already_owned');
    END IF;
    DELETE FROM public.user_gift_shop_entitlements g
    WHERE g.user_id = uid AND g.gift_id = p_item_id
      AND g.expires_at IS NOT NULL AND g.expires_at <= now();

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_item_type');
  END IF;

  IF v_coins < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_diamonds');
  END IF;

  v_exp := CASE WHEN v_dur IS NOT NULL AND v_dur > 0 THEN now() + (v_dur::text || ' days')::interval ELSE NULL END;

  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  PERFORM set_config('app.calling_function', 'purchase_shop_item', true);

  UPDATE public.profiles SET coins = coins - v_price WHERE id = uid;

  IF v_type = 'avatar_frame' THEN
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (uid, p_item_id, 'avatar_frames', 'vip', v_exp, 'shop purchase');
  ELSIF v_type = 'role_frame' THEN
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (uid, p_item_id, 'role_frames', 'vip', v_exp, 'shop purchase');
  ELSIF v_type = 'entry_effect' THEN
    INSERT INTO public.user_entry_effects (user_id, effect_id, expires_at)
    VALUES (uid, p_item_id, v_exp);
  ELSIF v_type = 'chat_bubble' THEN
    INSERT INTO public.user_chat_bubbles (user_id, bubble_id, expires_at)
    VALUES (uid, p_item_id, v_exp);
  ELSIF v_type = 'gift_item' THEN
    INSERT INTO public.user_gift_shop_entitlements (user_id, gift_id, expires_at)
    VALUES (uid, p_item_id, v_exp);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', (SELECT coins FROM public.profiles WHERE id = uid)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.purchase_shop_item(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_shop_item(text, uuid, integer) TO authenticated;

DO $p$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.entry_effects; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_bubbles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_entry_effects; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_chat_bubbles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.user_gift_shop_entitlements; EXCEPTION WHEN duplicate_object THEN NULL; END;
END;
$p$;