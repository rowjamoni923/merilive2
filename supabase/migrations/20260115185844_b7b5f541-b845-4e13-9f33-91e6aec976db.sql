-- Insert new casino games into game_settings
INSERT INTO game_settings (game_id, game_name, game_emoji, game_color, description, min_bet, max_bet, win_probability, max_multiplier, is_active, display_order, game_type, house_edge)
VALUES 
  ('aviator', 'Aviator', '✈️', 'from-orange-500 to-red-600', 'Cash out before the plane flies away! Classic crash game.', 100, 1000000, 45, 100, true, 1, 'internal', 3),
  ('plinko', 'Plinko', '🔴', 'from-blue-500 to-cyan-600', 'Drop the ball and watch it bounce for multipliers!', 100, 500000, 50, 50, true, 2, 'internal', 2),
  ('dragon_tiger', 'Dragon Tiger', '🐉', 'from-red-600 to-orange-500', 'Bet on Dragon or Tiger - simple and fast card game!', 100, 1000000, 48, 2, true, 3, 'internal', 3),
  ('andar_bahar', 'Andar Bahar', '🃏', 'from-green-600 to-emerald-500', 'Classic Indian card game - Andar or Bahar?', 100, 1000000, 48, 2, true, 4, 'internal', 3),
  ('roulette', 'Roulette', '🎡', 'from-red-700 to-black', 'Spin the wheel and bet on numbers, colors, or sections!', 100, 500000, 47, 36, true, 5, 'internal', 2.7),
  ('baccarat', 'Baccarat', '🎴', 'from-amber-600 to-yellow-500', 'Bet on Player, Banker, or Tie in this elegant card game!', 100, 1000000, 45, 8, true, 6, 'internal', 1.5),
  ('blackjack', 'Blackjack', '🃏', 'from-slate-700 to-slate-900', 'Get 21 or beat the dealer without going bust!', 100, 500000, 42, 3, true, 7, 'internal', 0.5),
  ('hilo', 'Hi-Lo', '🔼', 'from-violet-600 to-purple-700', 'Predict if the next card is higher or lower!', 100, 500000, 48, 10, true, 8, 'internal', 2),
  ('mines', 'Mines', '💣', 'from-gray-700 to-gray-900', 'Avoid the mines and collect gems for multipliers!', 100, 500000, 50, 25, true, 9, 'internal', 2),
  ('limbo', 'Limbo', '🎯', 'from-cyan-600 to-blue-700', 'Set your target multiplier and test your luck!', 100, 500000, 40, 1000, true, 10, 'internal', 1)
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  game_color = EXCLUDED.game_color,
  description = EXCLUDED.description,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order;

-- Deactivate old games that are not in the new list
UPDATE game_settings 
SET is_active = false 
WHERE game_id NOT IN ('aviator', 'plinko', 'dragon_tiger', 'andar_bahar', 'roulette', 'baccarat', 'blackjack', 'hilo', 'mines', 'limbo', 'crash', 'wheel', 'dice', 'coinflip', 'slots', 'lucky28');