-- Add previous_ columns to store the item before VIP purchase
-- These will be restored when the purchased item expires

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS previous_frame_id uuid,
ADD COLUMN IF NOT EXISTS previous_entrance_id uuid,
ADD COLUMN IF NOT EXISTS previous_bubble_id uuid,
ADD COLUMN IF NOT EXISTS previous_vehicle_id uuid,
ADD COLUMN IF NOT EXISTS previous_medal_id uuid,
ADD COLUMN IF NOT EXISTS previous_noble_card_id uuid,
ADD COLUMN IF NOT EXISTS previous_entry_banner_id uuid,
ADD COLUMN IF NOT EXISTS previous_entry_name_bar_id uuid;

-- Create a function to check and restore expired items
CREATE OR REPLACE FUNCTION public.restore_expired_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_purchase RECORD;
  profile_record RECORD;
  category_column TEXT;
  previous_column TEXT;
BEGIN
  -- Find all expired purchases that are still equipped
  FOR expired_purchase IN 
    SELECT up.*, si.category 
    FROM user_purchases up
    JOIN shop_items si ON up.item_id = si.id
    WHERE up.is_equipped = true 
    AND up.expires_at IS NOT NULL 
    AND up.expires_at < NOW()
    AND up.is_active = true
  LOOP
    -- Determine which column to update based on category
    CASE expired_purchase.category
      WHEN 'frame', 'portrait_frame' THEN
        category_column := 'equipped_frame_id';
        previous_column := 'previous_frame_id';
      WHEN 'entrance', 'entrance_effect' THEN
        category_column := 'equipped_entrance_id';
        previous_column := 'previous_entrance_id';
      WHEN 'chat_bubble' THEN
        category_column := 'equipped_bubble_id';
        previous_column := 'previous_bubble_id';
      WHEN 'vehicle' THEN
        category_column := 'equipped_vehicle_id';
        previous_column := 'previous_vehicle_id';
      WHEN 'medal' THEN
        category_column := 'equipped_medal_id';
        previous_column := 'previous_medal_id';
      WHEN 'noble_card' THEN
        category_column := 'equipped_noble_card_id';
        previous_column := 'previous_noble_card_id';
      WHEN 'entry_banner' THEN
        category_column := 'equipped_entry_banner_id';
        previous_column := 'previous_entry_banner_id';
      WHEN 'entry_bar', 'entry_name_bar' THEN
        category_column := 'equipped_entry_name_bar_id';
        previous_column := 'previous_entry_name_bar_id';
      ELSE
        CONTINUE;
    END CASE;

    -- Restore previous item for this user
    EXECUTE format(
      'UPDATE profiles SET %I = %I, %I = NULL WHERE id = $1',
      category_column, previous_column, previous_column
    ) USING expired_purchase.user_id;

    -- Mark purchase as unequipped
    UPDATE user_purchases 
    SET is_equipped = false 
    WHERE id = expired_purchase.id;

    RAISE NOTICE 'Restored previous item for user % category %', 
      expired_purchase.user_id, expired_purchase.category;
  END LOOP;
END;
$$;

-- Create a trigger function to auto-check on profile access
CREATE OR REPLACE FUNCTION public.check_expired_items_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if any equipped items have expired for this user
  PERFORM restore_expired_items();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.restore_expired_items() IS 'Restores previous items when VIP purchased items expire';