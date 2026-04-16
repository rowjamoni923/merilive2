-- Update campaign to show on all locations including profile
UPDATE recharge_campaigns 
SET display_locations = ARRAY['home', 'party', 'reels', 'chat', 'profile'] 
WHERE id = '0667e913-b6eb-4103-a8d3-a25d9fe1bf23';

-- Also set target_audience to 'all' so all users can see it
UPDATE recharge_campaigns 
SET target_audience = 'all' 
WHERE id = '0667e913-b6eb-4103-a8d3-a25d9fe1bf23';