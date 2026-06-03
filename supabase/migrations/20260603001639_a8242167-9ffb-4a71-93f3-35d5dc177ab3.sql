CREATE OR REPLACE FUNCTION public.sanitize_profile_equipped_ids()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Frame: valid if it exists in avatar_frames OR role_frames OR leaderboard_podium_frames OR shop_items (frame category)
  IF NEW.equipped_frame_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.avatar_frames WHERE id = NEW.equipped_frame_id)
       AND NOT EXISTS (SELECT 1 FROM public.role_frames WHERE id = NEW.equipped_frame_id)
       AND NOT EXISTS (SELECT 1 FROM public.leaderboard_podium_frames WHERE id = NEW.equipped_frame_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.shop_items
         WHERE id = NEW.equipped_frame_id
           AND category IN ('frame','portrait_frame','avatar_frame','role_frame')
       )
    THEN
      NEW.equipped_frame_id := NULL;
    END IF;
  END IF;

  -- Entry name bar: entry_name_bars OR shop_items (entry_bar/entry_name_bar) OR level_privileges
  IF NEW.equipped_entry_name_bar_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.entry_name_bars WHERE id = NEW.equipped_entry_name_bar_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.shop_items
         WHERE id = NEW.equipped_entry_name_bar_id
           AND category IN ('entry_bar','entry_name_bar')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.level_privileges
         WHERE id = NEW.equipped_entry_name_bar_id
           AND privilege_type IN ('entry_bar','entry_name_bar','entry_bar_effect')
       )
    THEN
      NEW.equipped_entry_name_bar_id := NULL;
    END IF;
  END IF;

  -- Entrance: entry_banners OR shop_items (entrance/entry_banner) OR level_privileges OR vip_tiers
  IF NEW.equipped_entrance_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.entry_banners WHERE id = NEW.equipped_entrance_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.shop_items
         WHERE id = NEW.equipped_entrance_id
           AND category IN ('entrance','entrance_effect','entry_banner')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.level_privileges
         WHERE id = NEW.equipped_entrance_id
           AND privilege_type IN ('entrance','entrance_effect','entry_banner')
       )
       AND NOT EXISTS (SELECT 1 FROM public.vip_tiers WHERE id = NEW.equipped_entrance_id)
    THEN
      NEW.equipped_entrance_id := NULL;
    END IF;
  END IF;

  -- Entry banner (mirror column): same sources as entrance
  IF NEW.equipped_entry_banner_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.entry_banners WHERE id = NEW.equipped_entry_banner_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.shop_items
         WHERE id = NEW.equipped_entry_banner_id
           AND category IN ('entrance','entrance_effect','entry_banner')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.level_privileges
         WHERE id = NEW.equipped_entry_banner_id
           AND privilege_type IN ('entrance','entrance_effect','entry_banner')
       )
       AND NOT EXISTS (SELECT 1 FROM public.vip_tiers WHERE id = NEW.equipped_entry_banner_id)
    THEN
      NEW.equipped_entry_banner_id := NULL;
    END IF;
  END IF;

  -- Vehicle: vehicle_entrances OR shop_items (vehicle) OR level_privileges
  IF NEW.equipped_vehicle_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vehicle_entrances WHERE id = NEW.equipped_vehicle_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.shop_items
         WHERE id = NEW.equipped_vehicle_id
           AND category IN ('vehicle','vehicle_entrance')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.level_privileges
         WHERE id = NEW.equipped_vehicle_id
           AND privilege_type = 'vehicle_entrance'
       )
    THEN
      NEW.equipped_vehicle_id := NULL;
    END IF;
  END IF;

  -- Bubble: chat_bubbles (if table exists) OR shop_items (bubble) OR level_privileges
  BEGIN
    IF NEW.equipped_bubble_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.chat_bubbles WHERE id = NEW.equipped_bubble_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.shop_items
           WHERE id = NEW.equipped_bubble_id
             AND category IN ('bubble','chat_bubble')
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.level_privileges
           WHERE id = NEW.equipped_bubble_id
             AND privilege_type IN ('bubble','chat_bubble')
         )
      THEN
        NEW.equipped_bubble_id := NULL;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    -- chat_bubbles table missing — fall back to shop_items / level_privileges only
    IF NEW.equipped_bubble_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.shop_items
         WHERE id = NEW.equipped_bubble_id
           AND category IN ('bubble','chat_bubble')
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.level_privileges
         WHERE id = NEW.equipped_bubble_id
           AND privilege_type IN ('bubble','chat_bubble')
       )
    THEN
      NEW.equipped_bubble_id := NULL;
    END IF;
  END;

  -- Medal: medals (if table exists) OR shop_items OR level_privileges
  BEGIN
    IF NEW.equipped_medal_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.medals WHERE id = NEW.equipped_medal_id)
         AND NOT EXISTS (
           SELECT 1 FROM public.shop_items
           WHERE id = NEW.equipped_medal_id
             AND category IN ('badge','medal','vip_medal')
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.level_privileges
           WHERE id = NEW.equipped_medal_id
             AND privilege_type IN ('badge','medal','vip_medal')
         )
      THEN
        NEW.equipped_medal_id := NULL;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  -- Noble card
  BEGIN
    IF NEW.equipped_noble_card_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.noble_cards WHERE id = NEW.equipped_noble_card_id) THEN
        NEW.equipped_noble_card_id := NULL;
      END IF;
    END IF;
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;