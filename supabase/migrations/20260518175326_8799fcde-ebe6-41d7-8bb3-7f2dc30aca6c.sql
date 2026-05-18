
-- Ensure game_id is unique so we can upsert reliably
CREATE UNIQUE INDEX IF NOT EXISTS game_settings_game_id_key ON public.game_settings(game_id);

INSERT INTO public.game_settings (
  game_id, game_name, game_emoji, game_color, description,
  game_url, game_type, category,
  is_active, is_featured, display_order,
  min_bet, max_bet, max_multiplier, house_edge,
  win_probability, min_win_probability, max_win_probability,
  jackpot_percentage, jackpot_multiplier,
  setting_key, setting_value
) VALUES
  ('roulette', '3D Roulette Royale', '🎰', '#D4AF37',
   'Premium luxurious 3D roulette — spin the golden wheel and win up to 35x',
   '/games/roulette', 'internal', 'casino',
   true, true, 1, 100, 100000, 35, 2.7, 0.486, 0.40, 0.55, 1.0, 100,
   'roulette_config', '{}'::jsonb),
  ('ferris-wheel', 'Lucky Ferris Wheel', '🎡', '#FF1493',
   'Premium 3D Ferris Wheel of fortune — multipliers up to 50x',
   '/games/ferris-wheel', 'internal', 'lucky',
   true, true, 2, 100, 50000, 50, 3.5, 0.45, 0.35, 0.55, 1.5, 50,
   'ferris_wheel_config', '{}'::jsonb),
  ('teen-patti', 'Teen Patti Gold', '🃏', '#B8860B',
   'Premium 3D Teen Patti — classic Indian card game with luxury table feel',
   '/games/teen-patti', 'internal', 'cards',
   true, true, 3, 100, 100000, 10, 3.0, 0.48, 0.40, 0.55, 0.5, 20,
   'teen_patti_config', '{}'::jsonb)
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  game_color = EXCLUDED.game_color,
  description = EXCLUDED.description,
  game_url = EXCLUDED.game_url,
  game_type = EXCLUDED.game_type,
  category = EXCLUDED.category,
  is_active = true,
  is_featured = EXCLUDED.is_featured,
  display_order = EXCLUDED.display_order,
  updated_at = now();
