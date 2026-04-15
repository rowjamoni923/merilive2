
-- Insert third-party games from gamesp.ccdn.ink provider
INSERT INTO game_settings (game_type, setting_key, game_name, game_url, logo_url, category, is_active, is_featured, display_order, min_bet, max_bet, description)
VALUES
  ('third_party', 'dragon_tiger_battle', 'Dragon Tiger Battle', 'https://gamesp.ccdn.ink/dragonTigerBattle/', NULL, 'card', true, true, 1, 100, 1000000, 'Classic Dragon Tiger card game'),
  ('third_party', 'roulette_ext', 'Roulette', 'https://gamesp.ccdn.ink/roulette/', NULL, 'casino', true, true, 2, 100, 1000000, 'Classic Roulette wheel game'),
  ('third_party', 'greedy_cat', 'Greedy Cat', 'https://gamesp.ccdn.ink/greedyCat/', NULL, 'slot', true, true, 3, 100, 500000, 'Fun slot game with cats'),
  ('third_party', 'teen_patti_big', 'Teen Patti Big', 'https://gamesp.ccdn.ink/teenPatti/', NULL, 'card', true, true, 4, 100, 1000000, 'Popular Teen Patti card game'),
  ('third_party', 'fruit_machine_fairy', 'Fruit Machine Fairy', 'https://gamesp.ccdn.ink/fruitMachineFairy/', NULL, 'slot', true, true, 5, 100, 500000, 'Colorful fruit slot machine'),
  ('third_party', 'beach_party', 'Beach Party', 'https://gamesp.ccdn.ink/teenPattiBeachParty/', NULL, 'card', true, false, 6, 100, 1000000, 'Beach themed party card game'),
  ('third_party', 'cat_plus_pro', 'Cat Plus Pro', 'https://gamesp.ccdn.ink/greedyCatPlusPro/', NULL, 'slot', true, false, 7, 100, 500000, 'Advanced cat slot game');
