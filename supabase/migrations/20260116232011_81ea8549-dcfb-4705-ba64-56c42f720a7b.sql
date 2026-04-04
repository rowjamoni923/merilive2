-- Insert FREE game providers into the database
INSERT INTO game_providers (
  provider_id, provider_name, provider_type, is_active, is_verified,
  api_url, description, website_url, documentation_url, available_games, logo_url
) VALUES 
-- Deck of Cards API - Completely FREE
(
  'deckofcards',
  'Deck of Cards API',
  'api',
  true,
  true,
  'https://www.deckofcardsapi.com/api/deck',
  'সম্পূর্ণ ফ্রি Card Games API - Poker, Blackjack, Teen Patti সবই খেলা যায়',
  'https://www.deckofcardsapi.com/',
  'https://www.deckofcardsapi.com/',
  '[
    {"code": "blackjack", "name": "Blackjack", "category": "Card Games"},
    {"code": "poker", "name": "Poker", "category": "Card Games"},
    {"code": "teenpatti", "name": "Teen Patti", "category": "Card Games"},
    {"code": "baccarat", "name": "Baccarat", "category": "Card Games"},
    {"code": "war", "name": "Casino War", "category": "Card Games"}
  ]'::jsonb,
  '🃏'
),
-- GameDistribution - FREE with ads
(
  'gamedistribution',
  'GameDistribution',
  'iframe',
  true,
  true,
  'https://html5.gamedistribution.com',
  'বিশ্বের সবচেয়ে বড় HTML5 গেম প্ল্যাটফর্ম - 10,000+ ফ্রি গেম',
  'https://gamedistribution.com/',
  'https://github.com/GameDistribution/GD-HTML5/wiki',
  '[
    {"code": "ludo-hero", "name": "Ludo Hero", "category": "Board Games", "gameId": "c3d28eba03884ad89f1c8c9d7bec3b34"},
    {"code": "snake-io", "name": "Snake.io", "category": "Action", "gameId": "0fd7d4a8ed8c4a6da9e8f7e8f9e0e1e2"},
    {"code": "racing-games", "name": "Racing Games", "category": "Racing", "gameId": "a1b2c3d4e5f6g7h8i9j0"},
    {"code": "bubble-shooter", "name": "Bubble Shooter", "category": "Puzzle", "gameId": "bubble123"},
    {"code": "chess", "name": "Chess", "category": "Board Games", "gameId": "chess456"}
  ]'::jsonb,
  '🎮'
),
-- GamePix - FREE HTML5 Games
(
  'gamepix',
  'GamePix',
  'iframe',
  true,
  true,
  'https://www.gamepix.com/embed',
  'ফ্রি HTML5 গেম - মোবাইল ফ্রেন্ডলি - 5,000+ গেম',
  'https://www.gamepix.com/',
  'https://www.gamepix.com/developers',
  '[
    {"code": "ludo-king-online", "name": "Ludo King Online", "category": "Board Games"},
    {"code": "chess-online", "name": "Chess Online", "category": "Board Games"},
    {"code": "pool-8-ball", "name": "8 Ball Pool", "category": "Sports"},
    {"code": "uno-online", "name": "UNO Online", "category": "Card Games"},
    {"code": "carrom-pool", "name": "Carrom Pool", "category": "Board Games"}
  ]'::jsonb,
  '🎲'
),
-- GamerPower - FREE Giveaways API
(
  'gamerpower',
  'GamerPower Giveaways',
  'api',
  true,
  true,
  'https://www.gamerpower.com/api',
  'ফ্রি গেম Giveaways - Steam, Epic Games থেকে ফ্রি গেম পান',
  'https://www.gamerpower.com/',
  'https://www.gamerpower.com/api-read',
  '[
    {"code": "giveaways", "name": "Free Game Giveaways", "category": "Giveaways"},
    {"code": "steam-giveaways", "name": "Steam Giveaways", "category": "Giveaways"},
    {"code": "epic-giveaways", "name": "Epic Games Giveaways", "category": "Giveaways"}
  ]'::jsonb,
  '🎁'
),
-- Playroom SDK - Free Tier Multiplayer
(
  'playroom',
  'Playroom Multiplayer',
  'sdk',
  true,
  true,
  'https://joinplayroom.com/api',
  'ফ্রি টিয়ার Multiplayer গেম SDK - Real-time multiplayer games',
  'https://joinplayroom.com/',
  'https://docs.joinplayroom.com/',
  '[
    {"code": "multiplayer-ludo", "name": "Multiplayer Ludo", "category": "Multiplayer"},
    {"code": "multiplayer-chess", "name": "Multiplayer Chess", "category": "Multiplayer"},
    {"code": "party-games", "name": "Party Games", "category": "Multiplayer"}
  ]'::jsonb,
  '👥'
),
-- CrazyGames - Free HTML5 Games
(
  'crazygames',
  'CrazyGames',
  'iframe',
  true,
  true,
  'https://www.crazygames.com/embed',
  'ফ্রি ব্রাউজার গেম - কোন ডাউনলোড লাগবে না',
  'https://www.crazygames.com/',
  'https://developer.crazygames.com/',
  '[
    {"code": "1v1-lol", "name": "1v1.LOL", "category": "Action"},
    {"code": "krunker", "name": "Krunker.io", "category": "Shooter"},
    {"code": "subway-surfers", "name": "Subway Surfers", "category": "Endless Runner"},
    {"code": "temple-run", "name": "Temple Run", "category": "Endless Runner"}
  ]'::jsonb,
  '🎯'
)
ON CONFLICT (provider_id) DO UPDATE SET
  provider_name = EXCLUDED.provider_name,
  api_url = EXCLUDED.api_url,
  description = EXCLUDED.description,
  website_url = EXCLUDED.website_url,
  documentation_url = EXCLUDED.documentation_url,
  available_games = EXCLUDED.available_games,
  is_active = true,
  is_verified = true,
  updated_at = now();