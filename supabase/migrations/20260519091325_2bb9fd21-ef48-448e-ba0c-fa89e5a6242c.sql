CREATE OR REPLACE FUNCTION public.validate_profile_equipped_assets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.equipped_frame_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.avatar_frames af WHERE af.id = NEW.equipped_frame_id)
       AND NOT EXISTS (SELECT 1 FROM public.role_frames rf WHERE rf.id = NEW.equipped_frame_id)
       AND NOT EXISTS (SELECT 1 FROM public.leaderboard_podium_frames lpf WHERE lpf.id = NEW.equipped_frame_id)
       AND NOT EXISTS (SELECT 1 FROM public.shop_items si WHERE si.id = NEW.equipped_frame_id AND si.category IN ('frame', 'portrait_frame', 'avatar_frame', 'role_frame')) THEN
      RAISE EXCEPTION 'Invalid equipped_frame_id: avatar frame slot only accepts avatar_frames, role_frames, leaderboard_podium_frames, or frame/portrait_frame shop_items';
    END IF;
  END IF;

  IF NEW.equipped_entrance_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.entry_banners eb WHERE eb.id = NEW.equipped_entrance_id)
       AND NOT EXISTS (SELECT 1 FROM public.shop_items si WHERE si.id = NEW.equipped_entrance_id AND si.category IN ('entrance', 'entrance_effect', 'entry_banner'))
       AND NOT EXISTS (SELECT 1 FROM public.level_privileges lp WHERE lp.id = NEW.equipped_entrance_id AND lp.privilege_type IN ('entrance', 'entrance_effect', 'entry_banner'))
       AND NOT EXISTS (SELECT 1 FROM public.vip_tiers vt WHERE vt.id = NEW.equipped_entrance_id) THEN
      RAISE EXCEPTION 'Invalid equipped_entrance_id: entrance slot only accepts entrance/entry banner assets';
    END IF;
  END IF;

  IF NEW.equipped_entry_banner_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.entry_banners eb WHERE eb.id = NEW.equipped_entry_banner_id)
       AND NOT EXISTS (SELECT 1 FROM public.shop_items si WHERE si.id = NEW.equipped_entry_banner_id AND si.category IN ('entrance', 'entrance_effect', 'entry_banner'))
       AND NOT EXISTS (SELECT 1 FROM public.level_privileges lp WHERE lp.id = NEW.equipped_entry_banner_id AND lp.privilege_type IN ('entrance', 'entrance_effect', 'entry_banner'))
       AND NOT EXISTS (SELECT 1 FROM public.vip_tiers vt WHERE vt.id = NEW.equipped_entry_banner_id) THEN
      RAISE EXCEPTION 'Invalid equipped_entry_banner_id: entry banner slot only accepts entry banner assets';
    END IF;
  END IF;

  IF NEW.equipped_entry_name_bar_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.entry_name_bars enb WHERE enb.id = NEW.equipped_entry_name_bar_id)
       AND NOT EXISTS (SELECT 1 FROM public.shop_items si WHERE si.id = NEW.equipped_entry_name_bar_id AND si.category IN ('entry_bar', 'entry_name_bar'))
       AND NOT EXISTS (SELECT 1 FROM public.level_privileges lp WHERE lp.id = NEW.equipped_entry_name_bar_id AND lp.privilege_type IN ('entry_bar', 'entry_name_bar', 'entry_bar_effect')) THEN
      RAISE EXCEPTION 'Invalid equipped_entry_name_bar_id: name bar slot only accepts entry/name bar assets';
    END IF;
  END IF;

  IF NEW.equipped_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vehicle_entrances ve WHERE ve.id = NEW.equipped_vehicle_id)
       AND NOT EXISTS (SELECT 1 FROM public.shop_items si WHERE si.id = NEW.equipped_vehicle_id AND si.category IN ('vehicle', 'vehicle_entrance'))
       AND NOT EXISTS (SELECT 1 FROM public.level_privileges lp WHERE lp.id = NEW.equipped_vehicle_id AND lp.privilege_type = 'vehicle_entrance') THEN
      RAISE EXCEPTION 'Invalid equipped_vehicle_id: vehicle slot only accepts vehicle entrance assets';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;