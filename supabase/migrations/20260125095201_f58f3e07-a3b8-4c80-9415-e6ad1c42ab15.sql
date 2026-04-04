
-- STEP 1: Credit the lost 11M beans to Hot baby (host_id: c02c5d52-1d10-4259-a31d-0eae1c31f49c)
-- The gift was 20M diamonds, host should get 55% = 11M beans
UPDATE profiles
SET 
  pending_earnings = COALESCE(pending_earnings, 0) + 11000000,
  total_earnings = COALESCE(total_earnings, 0) + 11000000
WHERE id = 'c02c5d52-1d10-4259-a31d-0eae1c31f49c';

-- STEP 2: Drop the problematic foreign key constraint on equipped_frame_id
-- This constraint references shop_items but frames are in avatar_frames table
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_equipped_frame_id_fkey;
