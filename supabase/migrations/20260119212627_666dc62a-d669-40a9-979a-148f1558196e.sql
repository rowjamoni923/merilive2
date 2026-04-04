-- Add new free external games to game_settings
INSERT INTO game_settings (game_id, game_name, game_emoji, game_color, description, min_bet, max_bet, win_probability, max_multiplier, is_active, display_order, game_type, house_edge, category, game_url, iframe_height, iframe_width)
VALUES 
  -- Free HTML5 Games from GamePix/GameDistribution
  ('ludo', 'Ludo King', '🎲', 'from-yellow-500 to-orange-600', 'Classic Ludo board game - race your pieces home!', 100, 100000, 25, 4, true, 20, 'external', 0, 'board', 'https://www.gamepix.com/embed/ludo-hero', 500, 100),
  ('teenpatti', 'Teen Patti', '🃏', 'from-red-600 to-pink-600', 'Indian classic 3-card poker game!', 100, 500000, 33, 8, true, 21, 'external', 3, 'cards', 'https://www.gamepix.com/embed/teen-patti-online', 500, 100),
  ('uno', 'UNO Cards', '🎴', 'from-red-500 to-blue-600', 'Classic UNO card game with friends!', 100, 50000, 25, 2, true, 22, 'external', 0, 'cards', 'https://www.gamepix.com/embed/crazy-eights', 500, 100),
  ('carrom', 'Carrom Pool', '⚪', 'from-amber-600 to-brown-600', 'Strike and pocket - classic Carrom!', 100, 100000, 50, 3, true, 23, 'external', 0, 'board', 'https://www.gamepix.com/embed/carrom-billiards', 500, 100),
  ('chess', 'Chess Master', '♟️', 'from-slate-600 to-gray-800', 'Classic chess - outsmart your opponent!', 100, 200000, 50, 2, true, 24, 'external', 0, 'board', 'https://www.gamepix.com/embed/chess', 500, 100),
  ('pool', '8 Ball Pool', '🎱', 'from-green-600 to-teal-600', 'Pocket all balls - classic pool!', 100, 100000, 50, 2, true, 25, 'external', 0, 'sports', 'https://www.gamepix.com/embed/8-ball-billiards-classic', 500, 100),
  ('rummy', 'Rummy Cards', '🂡', 'from-purple-600 to-indigo-600', 'Form sets and runs - classic Rummy!', 100, 200000, 40, 5, true, 26, 'external', 2, 'cards', 'https://www.gamepix.com/embed/gin-rummy', 500, 100),
  ('snake', 'Snake.io', '🐍', 'from-green-500 to-lime-500', 'Grow your snake and dominate!', 100, 50000, 20, 10, true, 27, 'external', 0, 'action', 'https://www.gamepix.com/embed/snake-io', 500, 100)
ON CONFLICT (game_id) DO UPDATE SET
  game_name = EXCLUDED.game_name,
  game_emoji = EXCLUDED.game_emoji,
  game_color = EXCLUDED.game_color,
  description = EXCLUDED.description,
  game_type = EXCLUDED.game_type,
  game_url = EXCLUDED.game_url,
  iframe_height = EXCLUDED.iframe_height,
  iframe_width = EXCLUDED.iframe_width,
  category = EXCLUDED.category,
  is_active = EXCLUDED.is_active;