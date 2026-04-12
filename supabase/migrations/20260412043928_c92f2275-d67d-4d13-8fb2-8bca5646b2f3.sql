UPDATE public.banners 
SET image_url = REPLACE(image_url, 'pppcwawjjpwwrmvezcdy.supabase.co', 'ayjdlvuurscxucatbbah.supabase.co')
WHERE image_url LIKE '%pppcwawjjpwwrmvezcdy%';

UPDATE public.banners 
SET link_url = REPLACE(link_url, 'pppcwawjjpwwrmvezcdy.supabase.co', 'ayjdlvuurscxucatbbah.supabase.co')
WHERE link_url IS NOT NULL AND link_url LIKE '%pppcwawjjpwwrmvezcdy%';