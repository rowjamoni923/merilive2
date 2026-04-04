-- Add Level 9 and 10 to user_level_tiers with values within integer range
INSERT INTO user_level_tiers (level_number, level_name, tier_type, min_topup_amount, min_earning_amount, level_icon, level_color, bg_gradient, is_active, display_order)
VALUES 
  (9, 'Supreme', 'user', 1000000000, 0, '👑', '#fbbf24', 'from-rose-500 to-amber-500', true, 9),
  (10, 'Immortal', 'user', 2000000000, 0, '🌟', '#facc15', 'from-amber-400 to-yellow-300', true, 10)
ON CONFLICT DO NOTHING;