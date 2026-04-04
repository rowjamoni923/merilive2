-- Activate some payment gateways by default for demonstration
UPDATE payment_gateways SET is_active = true WHERE gateway_code IN ('bkash', 'nagad', 'rocket');

-- Add invitation_settings table to admin
INSERT INTO invitation_settings (tier_name, min_invites, max_invites, reward_coins, reward_beans, bonus_percentage, badge_color, badge_icon, display_order, is_active)
SELECT 'Bronze', 1, 4, 50, 0, 0, '#CD7F32', 'bronze', 1, true
WHERE NOT EXISTS (SELECT 1 FROM invitation_settings WHERE tier_name = 'Bronze');

INSERT INTO invitation_settings (tier_name, min_invites, max_invites, reward_coins, reward_beans, bonus_percentage, badge_color, badge_icon, display_order, is_active)
SELECT 'Silver', 5, 14, 100, 0, 5, '#C0C0C0', 'silver', 2, true
WHERE NOT EXISTS (SELECT 1 FROM invitation_settings WHERE tier_name = 'Silver');

INSERT INTO invitation_settings (tier_name, min_invites, max_invites, reward_coins, reward_beans, bonus_percentage, badge_color, badge_icon, display_order, is_active)
SELECT 'Gold', 15, 49, 200, 0, 10, '#FFD700', 'gold', 3, true
WHERE NOT EXISTS (SELECT 1 FROM invitation_settings WHERE tier_name = 'Gold');

INSERT INTO invitation_settings (tier_name, min_invites, max_invites, reward_coins, reward_beans, bonus_percentage, badge_color, badge_icon, display_order, is_active)
SELECT 'Platinum', 50, NULL, 500, 0, 20, '#E5E4E2', 'platinum', 4, true
WHERE NOT EXISTS (SELECT 1 FROM invitation_settings WHERE tier_name = 'Platinum');