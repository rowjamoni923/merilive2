INSERT INTO public.game_settings (setting_key, game_id, game_name, game_emoji, game_color, description, min_bet, max_bet, max_multiplier, is_active, is_featured, display_order, game_type, category, preset_bets)
VALUES
  ('lucky_number', 'lucky_number', 'Lucky Number', '🎯', 'from-purple-500 to-pink-500', 'Pick a lucky number 1-10. Win 9x your bet!', 500, 1000000, 9, true, true, 4, 'internal', 'casino', '[500,1000,5000,10000,20000]'::jsonb),
  ('rocket_race', 'rocket_race', 'Rocket Race', '🚀', 'from-orange-500 to-red-500', 'Pick the fastest rocket. Win up to 4x!', 500, 1000000, 4, true, true, 5, 'internal', 'casino', '[500,1000,5000,10000,20000]'::jsonb)
ON CONFLICT (game_id) DO UPDATE SET
  is_active = true,
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  max_multiplier = EXCLUDED.max_multiplier,
  preset_bets = EXCLUDED.preset_bets,
  updated_at = now();

UPDATE public.game_settings SET is_active = true WHERE game_id IN ('roulette','ferris-wheel','teen-patti','lucky_number','rocket_race');