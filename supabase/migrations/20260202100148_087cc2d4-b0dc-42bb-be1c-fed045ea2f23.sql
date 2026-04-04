-- Deactivate Car Race and Horse Race games
UPDATE game_settings 
SET is_active = false 
WHERE game_id IN ('car_race', 'horse_race');