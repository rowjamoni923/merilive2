-- Update Roulette game with default bet multipliers
UPDATE game_settings 
SET rules = '{"bet_multipliers": [{"bet_type": "zero", "label": "Zero (0)", "multiplier": 33}, {"bet_type": "red", "label": "Red", "multiplier": 2}, {"bet_type": "black", "label": "Black", "multiplier": 2}, {"bet_type": "even", "label": "Even", "multiplier": 2}, {"bet_type": "odd", "label": "Odd", "multiplier": 2}, {"bet_type": "low", "label": "1-18", "multiplier": 2}, {"bet_type": "high", "label": "19-36", "multiplier": 2}]}'::jsonb 
WHERE game_id = 'roulette';