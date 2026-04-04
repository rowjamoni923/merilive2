-- Add 4 new games: Car Race, Horse Race, Lucky Number, Rocket Race

INSERT INTO game_settings (game_id, game_name, game_emoji, game_color, description, min_bet, max_bet, win_probability, max_multiplier, is_active, display_order, game_type)
VALUES 
  ('car_race', 'Car Race', '🏎️', 'from-red-500 to-orange-600', '3 cars race on different road types. Pick the winner!', 100, 100000, 33, 4, true, 4, 'native'),
  ('horse_race', 'Horse Race', '🐎', 'from-green-500 to-emerald-600', '5 horses compete. Bet on your favorite to win!', 100, 100000, 20, 5, true, 5, 'native'),
  ('lucky_number', 'Lucky Number', '🎯', 'from-purple-500 to-pink-600', 'Guess the lucky number 1-10 and win 9x!', 100, 100000, 10, 9, true, 6, 'native'),
  ('rocket_race', 'Rocket Race', '🚀', 'from-cyan-500 to-blue-600', '3 rockets launch! Bet on which reaches the moon first!', 100, 100000, 33, 3.5, true, 7, 'native')
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  game_color = EXCLUDED.game_color,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order;