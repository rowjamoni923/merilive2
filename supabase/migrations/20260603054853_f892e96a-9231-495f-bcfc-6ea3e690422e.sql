
-- RLS lockdown
DROP POLICY IF EXISTS "Admin session full access" ON public.gifts;
CREATE POLICY pkg344_gifts_admin_select ON public.gifts FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR COALESCE(is_active,true)=true);
CREATE POLICY pkg344_gifts_admin_write ON public.gifts FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['gifts'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['gifts'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.gift_categories;
CREATE POLICY pkg344_gift_categories_admin_write ON public.gift_categories FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['gifts'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['gifts'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.gift_transactions;
CREATE POLICY pkg344_gift_transactions_admin_select ON public.gift_transactions FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());

DROP POLICY IF EXISTS "Admin session full access" ON public.gift_transaction_logs;
CREATE POLICY pkg344_gift_transaction_logs_admin_select ON public.gift_transaction_logs FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());

DROP POLICY IF EXISTS "Admin session full access" ON public.pk_battle_gifts;
CREATE POLICY pkg344_pk_battle_gifts_admin_write ON public.pk_battle_gifts FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['gifts','party-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['gifts','party-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.lucky_gift_config;
DROP POLICY IF EXISTS admin_full_access_lucky_gift_config ON public.lucky_gift_config;
CREATE POLICY pkg344_lucky_gift_config_admin_select ON public.lucky_gift_config FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR is_active=true);
CREATE POLICY pkg344_lucky_gift_config_admin_write ON public.lucky_gift_config FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['gifts'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['gifts'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.lucky_gift_results;
DROP POLICY IF EXISTS admin_full_access_lucky_gift_results ON public.lucky_gift_results;
CREATE POLICY pkg344_lucky_gift_results_admin_select ON public.lucky_gift_results FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());

DROP POLICY IF EXISTS "Admin session full access" ON public.vip_tiers;
CREATE POLICY pkg344_vip_tiers_admin_write ON public.vip_tiers FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['vip-hub','vip-privileges'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['vip-hub','vip-privileges'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.vip_perks;
DROP POLICY IF EXISTS vip_perks_admin_all ON public.vip_perks;
CREATE POLICY pkg344_vip_perks_admin_select ON public.vip_perks FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR is_active=true);
CREATE POLICY pkg344_vip_perks_admin_write ON public.vip_perks FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['vip-hub','vip-privileges'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['vip-hub','vip-privileges'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.vip_medals;
DROP POLICY IF EXISTS "Admin session full access on vip_medals" ON public.vip_medals;
CREATE POLICY pkg344_vip_medals_admin_select ON public.vip_medals FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR is_active=true);
CREATE POLICY pkg344_vip_medals_admin_write ON public.vip_medals FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['vip-medals','vip-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['vip-medals','vip-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.vip_exclusive_items;
CREATE POLICY pkg344_vip_exclusive_items_admin_write ON public.vip_exclusive_items FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['vip-exclusive-items','vip-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['vip-exclusive-items','vip-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.user_vip_subscriptions;
CREATE POLICY pkg344_user_vip_subscriptions_admin_select ON public.user_vip_subscriptions FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());
CREATE POLICY pkg344_user_vip_subscriptions_admin_write ON public.user_vip_subscriptions FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['vip-hub','user-management'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['vip-hub','user-management'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.user_vip_medals;
DROP POLICY IF EXISTS "Admin session full access on user_vip_medals" ON public.user_vip_medals;
CREATE POLICY pkg344_user_vip_medals_admin_select ON public.user_vip_medals FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());
CREATE POLICY pkg344_user_vip_medals_admin_write ON public.user_vip_medals FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['vip-medals','vip-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['vip-medals','vip-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.vip_daily_rewards_log;
DROP POLICY IF EXISTS "Admin session full access on vip_daily_rewards_log" ON public.vip_daily_rewards_log;
CREATE POLICY pkg344_vip_daily_rewards_log_admin_select ON public.vip_daily_rewards_log FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());

DROP POLICY IF EXISTS "Admin session full access" ON public.vip_recharge_bonus_log;
DROP POLICY IF EXISTS "Admin session full access on vip_recharge_bonus_log" ON public.vip_recharge_bonus_log;
CREATE POLICY pkg344_vip_recharge_bonus_log_admin_select ON public.vip_recharge_bonus_log FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());

DROP POLICY IF EXISTS "Admin session full access" ON public.noble_cards;
DROP POLICY IF EXISTS "Admin session full access on noble_cards" ON public.noble_cards;
CREATE POLICY pkg344_noble_cards_admin_select ON public.noble_cards FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR is_active=true);
CREATE POLICY pkg344_noble_cards_admin_write ON public.noble_cards FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['noble-cards'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['noble-cards'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.user_noble_subscriptions;
DROP POLICY IF EXISTS "Admin session full access on user_noble_subscriptions" ON public.user_noble_subscriptions;
CREATE POLICY pkg344_user_noble_subscriptions_admin_select ON public.user_noble_subscriptions FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());
CREATE POLICY pkg344_user_noble_subscriptions_admin_write ON public.user_noble_subscriptions FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['noble-cards','user-management'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['noble-cards','user-management'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.shop_items;
CREATE POLICY pkg344_shop_items_admin_write ON public.shop_items FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['shop-items','shop-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['shop-items','shop-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.user_purchased_backgrounds;
CREATE POLICY pkg344_user_purchased_backgrounds_admin_select ON public.user_purchased_backgrounds FOR SELECT TO authenticated, anon USING (public.is_active_admin_session());
CREATE POLICY pkg344_user_purchased_backgrounds_admin_write ON public.user_purchased_backgrounds FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['shop-hub','party-backgrounds','user-management'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['shop-hub','party-backgrounds','user-management'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.party_room_backgrounds;
DROP POLICY IF EXISTS "Admin users can delete party room backgrounds" ON public.party_room_backgrounds;
DROP POLICY IF EXISTS "Admin users can insert party room backgrounds" ON public.party_room_backgrounds;
DROP POLICY IF EXISTS "Admin users can update party room backgrounds" ON public.party_room_backgrounds;
DROP POLICY IF EXISTS "Admin users can view all party room backgrounds" ON public.party_room_backgrounds;
CREATE POLICY pkg344_party_room_backgrounds_admin_write ON public.party_room_backgrounds FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['party-backgrounds','shop-hub','party-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['party-backgrounds','shop-hub','party-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.user_gift_shop_entitlements;
DROP POLICY IF EXISTS user_gift_shop_ent_admin_all ON public.user_gift_shop_entitlements;
CREATE POLICY pkg344_user_gift_shop_ent_admin_select ON public.user_gift_shop_entitlements FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR auth.uid()=user_id);
CREATE POLICY pkg344_user_gift_shop_ent_admin_write ON public.user_gift_shop_entitlements FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['shop-hub','gifts','user-management'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['shop-hub','gifts','user-management'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.avatar_frames;
DROP POLICY IF EXISTS "Admins can manage avatar frames" ON public.avatar_frames;
CREATE POLICY pkg344_avatar_frames_admin_write ON public.avatar_frames FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['avatar-frames','visual-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['avatar-frames','visual-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.role_frames;
CREATE POLICY pkg344_role_frames_admin_write ON public.role_frames FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['role-frames','visual-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['role-frames','visual-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.user_role_frames;
DROP POLICY IF EXISTS "Admins can manage all role frame assignments" ON public.user_role_frames;
CREATE POLICY pkg344_user_role_frames_admin_select ON public.user_role_frames FOR SELECT TO authenticated, anon USING (public.is_active_admin_session() OR auth.uid()=user_id);
CREATE POLICY pkg344_user_role_frames_admin_write ON public.user_role_frames FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['avatar-frames','role-frames','visual-hub','user-management'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['avatar-frames','role-frames','visual-hub','user-management'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.leaderboard_podium_frames;
DROP POLICY IF EXISTS "Admins can manage podium frames" ON public.leaderboard_podium_frames;
CREATE POLICY pkg344_leaderboard_podium_frames_admin_write ON public.leaderboard_podium_frames FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['leaderboard','visual-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['leaderboard','visual-hub'], true));

DROP POLICY IF EXISTS "Admin session full access" ON public.level_privileges;
DROP POLICY IF EXISTS "Admins can manage level privileges" ON public.level_privileges;
CREATE POLICY pkg344_level_privileges_admin_write ON public.level_privileges FOR ALL TO authenticated, anon USING (public.admin_has_any_section_permission(ARRAY['level-privileges','level-hub'], true)) WITH CHECK (public.admin_has_any_section_permission(ARRAY['level-privileges','level-hub'], true));

-- RPC hardening
DROP FUNCTION IF EXISTS public.admin_gift_frame_to_user(uuid,uuid,text,timestamp with time zone,text);
CREATE FUNCTION public.admin_gift_frame_to_user(
  p_user_id uuid, p_frame_id uuid, p_source_table text,
  p_expires_at timestamp with time zone, p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_assignment_id uuid; v_frame_exists boolean; v_current_equipped uuid;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['avatar-frames','role-frames','visual-hub','user-management'], true) THEN
    RAISE EXCEPTION 'Unauthorized: requires avatar-frames/role-frames permission';
  END IF;
  IF p_source_table = 'avatar_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.avatar_frames WHERE id=p_frame_id AND is_active=true) INTO v_frame_exists;
  ELSIF p_source_table = 'role_frames' THEN
    SELECT EXISTS(SELECT 1 FROM public.role_frames WHERE id=p_frame_id AND is_active=true) INTO v_frame_exists;
  ELSE RAISE EXCEPTION 'Invalid source_table: %', p_source_table; END IF;
  IF NOT v_frame_exists THEN RAISE EXCEPTION 'Frame % not found or inactive in %', p_frame_id, p_source_table; END IF;
  PERFORM set_config('app.bypass_profile_protection', 'true', true);
  SELECT id INTO v_assignment_id FROM public.user_role_frames
    WHERE user_id=p_user_id AND frame_id=p_frame_id AND source_table=p_source_table LIMIT 1;
  IF v_assignment_id IS NOT NULL THEN
    UPDATE public.user_role_frames SET is_equipped=true, expires_at=p_expires_at, notes=p_notes, assigned_at=now() WHERE id=v_assignment_id;
    UPDATE public.user_role_frames SET is_equipped=false WHERE user_id=p_user_id AND id<>v_assignment_id AND is_equipped=true;
    SELECT equipped_frame_id INTO v_current_equipped FROM public.profiles WHERE id=p_user_id;
    UPDATE public.profiles SET previous_frame_id = CASE WHEN v_current_equipped IS NOT NULL AND v_current_equipped<>p_frame_id THEN v_current_equipped ELSE previous_frame_id END, equipped_frame_id=p_frame_id WHERE id=p_user_id;
  ELSE
    INSERT INTO public.user_role_frames (user_id, frame_id, source_table, role_type, expires_at, notes)
    VALUES (p_user_id, p_frame_id, p_source_table, 'admin', p_expires_at, p_notes) RETURNING id INTO v_assignment_id;
  END IF;
  RETURN jsonb_build_object('success',true,'assignment_id',v_assignment_id,'user_id',p_user_id,'frame_id',p_frame_id,'source_table',p_source_table);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_gift_frame_to_user(uuid,uuid,text,timestamp with time zone,text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_clear_frame_references(uuid);
CREATE FUNCTION public.admin_clear_frame_references(frame_id_to_clear uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['avatar-frames','role-frames','visual-hub'], true) THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
  UPDATE profiles SET equipped_frame_id=NULL WHERE equipped_frame_id=frame_id_to_clear;
  UPDATE profiles SET frame_id=NULL WHERE frame_id=frame_id_to_clear;
  UPDATE profiles SET previous_frame_id=NULL WHERE previous_frame_id=frame_id_to_clear;
  DELETE FROM user_role_frames WHERE frame_id=frame_id_to_clear;
  RETURN jsonb_build_object('success',true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_clear_frame_references(uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_upsert_party_background(uuid,uuid,text,text,text,text,boolean,boolean,integer,integer);
CREATE FUNCTION public.admin_upsert_party_background(
  _admin_id uuid, _id uuid, _name text, _image_url text, _gradient_css text,
  _category text, _is_premium boolean, _is_active boolean, _price_diamonds integer, _display_order integer
) RETURNS public.party_room_backgrounds LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.party_room_backgrounds;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['party-backgrounds','shop-hub','party-hub'], true) THEN
    RAISE EXCEPTION 'Access denied: requires party-backgrounds permission';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.party_room_backgrounds (name, image_url, gradient_css, category, is_premium, is_active, price_diamonds, display_order)
    VALUES (_name, _image_url, _gradient_css, _category, COALESCE(_is_premium,false), COALESCE(_is_active,true), COALESCE(_price_diamonds,0), COALESCE(_display_order,1))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.party_room_backgrounds SET name=_name, image_url=_image_url, gradient_css=_gradient_css, category=_category,
      is_premium=COALESCE(_is_premium,is_premium), is_active=COALESCE(_is_active,is_active),
      price_diamonds=COALESCE(_price_diamonds,price_diamonds), display_order=COALESCE(_display_order,display_order)
    WHERE id=_id RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_party_background(uuid,uuid,text,text,text,text,boolean,boolean,integer,integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_upsert_party_background(uuid,uuid,text,text,text,text,boolean,boolean,integer,integer,integer);
CREATE FUNCTION public.admin_upsert_party_background(
  _admin_id uuid, _id uuid, _name text, _image_url text, _gradient_css text,
  _category text, _is_premium boolean, _is_active boolean, _price_diamonds integer, _display_order integer, _min_level integer
) RETURNS public.party_room_backgrounds LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.party_room_backgrounds;
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['party-backgrounds','shop-hub','party-hub'], true) THEN
    RAISE EXCEPTION 'Access denied: requires party-backgrounds permission';
  END IF;
  IF _id IS NULL THEN
    INSERT INTO public.party_room_backgrounds (name, image_url, gradient_css, category, is_premium, is_active, price_diamonds, display_order, min_level)
    VALUES (_name, _image_url, _gradient_css, COALESCE(_category,'nature'), COALESCE(_is_premium,false), COALESCE(_is_active,true), COALESCE(_price_diamonds,0), COALESCE(_display_order,0), GREATEST(COALESCE(_min_level,0),0))
    RETURNING * INTO _row;
  ELSE
    UPDATE public.party_room_backgrounds SET name=_name, image_url=_image_url, gradient_css=_gradient_css,
      category=COALESCE(_category,category), is_premium=COALESCE(_is_premium,is_premium),
      is_active=COALESCE(_is_active,is_active), price_diamonds=COALESCE(_price_diamonds,price_diamonds),
      display_order=COALESCE(_display_order,display_order), min_level=GREATEST(COALESCE(_min_level,0),0), updated_at=now()
    WHERE id=_id RETURNING * INTO _row;
  END IF;
  RETURN _row;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_upsert_party_background(uuid,uuid,text,text,text,text,boolean,boolean,integer,integer,integer) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_delete_party_background(uuid,uuid);
CREATE FUNCTION public.admin_delete_party_background(_admin_id uuid, _id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.admin_has_any_section_permission(ARRAY['party-backgrounds','shop-hub','party-hub'], true) THEN
    RAISE EXCEPTION 'Access denied: requires party-backgrounds permission';
  END IF;
  DELETE FROM public.party_room_backgrounds WHERE id=_id;
  RETURN jsonb_build_object('success',true);
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_delete_party_background(uuid,uuid) TO anon, authenticated, service_role;
