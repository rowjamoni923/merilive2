-- Add FREE games to game_settings table so users can play with coins
INSERT INTO game_settings (
  game_id, game_name, game_emoji, game_color, description, 
  min_bet, max_bet, win_probability, max_multiplier, 
  is_active, game_type, category, display_order, preset_bets, rules
) VALUES 
-- Blackjack from Deck of Cards API
(
  'blackjack',
  'Blackjack 21',
  '🃏',
  'from-emerald-600 via-green-500 to-teal-400',
  'ক্লাসিক কার্ড গেম - 21 এ পৌঁছান এবং ডিলারকে হারান!',
  100, 100000, 48.5, 2.5,
  true, 'native', 'Card Games', 1,
  '[500, 1000, 5000, 10000, 25000]'::jsonb,
  '{"type": "blackjack", "provider": "deckofcards", "api": "https://deckofcardsapi.com"}'::jsonb
),
-- Hi-Lo Card Game
(
  'hilo',
  'Hi-Lo',
  '🔺',
  'from-orange-500 via-red-500 to-pink-500',
  'পরের কার্ড কি উঁচু না নিচু? সঠিক অনুমান করুন!',
  100, 50000, 50, 1.95,
  true, 'native', 'Card Games', 2,
  '[500, 1000, 2500, 5000, 10000]'::jsonb,
  '{"type": "hilo", "provider": "deckofcards"}'::jsonb
),
-- Baccarat
(
  'baccarat',
  'Baccarat',
  '👑',
  'from-purple-600 via-violet-500 to-indigo-500',
  'প্লেয়ার vs ব্যাংকার - কে জিতবে?',
  500, 200000, 49.3, 8.0,
  true, 'native', 'Card Games', 3,
  '[1000, 5000, 10000, 50000, 100000]'::jsonb,
  '{"type": "baccarat", "provider": "deckofcards"}'::jsonb
),
-- Poker (Simple 5-Card)
(
  'poker',
  'Video Poker',
  '♠️',
  'from-blue-600 via-indigo-500 to-purple-500',
  'সেরা পোকার হ্যান্ড বানান এবং জিতুন!',
  500, 100000, 45, 250,
  true, 'native', 'Card Games', 4,
  '[1000, 5000, 10000, 25000, 50000]'::jsonb,
  '{"type": "poker", "provider": "deckofcards"}'::jsonb
),
-- War Card Game
(
  'war',
  'Casino War',
  '⚔️',
  'from-red-600 via-rose-500 to-pink-500',
  'সবচেয়ে সহজ কার্ড গেম - উঁচু কার্ড জেতে!',
  100, 50000, 50, 2.0,
  true, 'native', 'Card Games', 5,
  '[500, 1000, 2500, 5000, 10000]'::jsonb,
  '{"type": "war", "provider": "deckofcards"}'::jsonb
)
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  game_color = EXCLUDED.game_color,
  description = EXCLUDED.description,
  min_bet = EXCLUDED.min_bet,
  max_bet = EXCLUDED.max_bet,
  win_probability = EXCLUDED.win_probability,
  max_multiplier = EXCLUDED.max_multiplier,
  is_active = EXCLUDED.is_active,
  game_type = EXCLUDED.game_type,
  category = EXCLUDED.category,
  rules = EXCLUDED.rules,
  preset_bets = EXCLUDED.preset_bets,
  updated_at = now();