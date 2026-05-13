-- Re-classify "Magic" shop item from 'frame' to 'entrance' (entry animation)
-- Reported by user: shows in Avatar Frames section but is actually an entry animation
UPDATE public.shop_items
SET category = 'entrance'
WHERE id = 'fc0f7979-e3cb-4ae0-bb15-8ab0a7ed1444'
  AND name = 'Magic'
  AND category = 'frame';