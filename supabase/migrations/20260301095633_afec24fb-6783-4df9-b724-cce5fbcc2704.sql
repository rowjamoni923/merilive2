
-- Insert all missing admin sections that exist in the sidebar but not in admin_sections table

-- User Hub - missing sections
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('all-users', 'All Users', 'user-hub', 3, true),
('host-search', 'Host Search', 'user-hub', 4, true),
('all-hosts', 'All Hosts', 'user-hub', 5, true),
('blocked-users', 'Blocked Users', 'user-hub', 6, true),
('face-violations', 'Face Violations', 'user-hub', 7, true),
('moderation', 'Moderation', 'user-hub', 8, true),
('user-reports', 'User Reports', 'user-hub', 9, true),
('user-hub', 'User Hub', 'user-hub', 0, true)
ON CONFLICT DO NOTHING;

-- Agency Hub - missing sections
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('agency-hub', 'Agency Hub', 'agency-hub', 9, true),
('agency-policy', 'Agency Policy', 'agency-hub', 14, true),
('commissions', 'Commissions', 'agency-hub', 15, true),
('commission-calculator', 'Commission Calculator', 'agency-hub', 16, true)
ON CONFLICT DO NOTHING;

-- Level Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('level-management', 'Level Management', 'level-hub', 19, true)
ON CONFLICT DO NOTHING;

-- VIP Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('vip-management', 'VIP & Noble System', 'vip-hub', 29, true),
('ranking-rewards', 'Ranking Rewards', 'vip-hub', 33, true)
ON CONFLICT DO NOTHING;

-- Visual Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('visual-assets', 'Visual Assets Hub', 'visual-hub', 39, true),
('role-frames', 'Role Frames', 'visual-hub', 44, true),
('entry-banners', 'Entry Banners', 'visual-hub', 45, true),
('entry-bars', 'Entry Bars', 'visual-hub', 46, true),
('entry-name-bars', 'Entry Name Bars', 'visual-hub', 47, true),
('animation-store', 'Animation Store', 'visual-hub', 48, true)
ON CONFLICT DO NOTHING;

-- Finance Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('finance', 'Finance Management', 'finance-hub', 59, true),
('coins', 'Coins Management', 'finance-hub', 60, true),
('topup-payment-methods', 'Topup Methods', 'finance-hub', 65, true),
('balance-deduction', 'Balance Deduction', 'finance-hub', 66, true),
('recharge-history', 'Recharge History', 'finance-hub', 67, true),
('transfer-scheduler', 'Transfer Scheduler', 'finance-hub', 68, true),
('payroll-orders', 'Payroll Orders', 'finance-hub', 69, true),
('shop', 'Shop', 'finance-hub', 100, true),
('gifts', 'Gifts', 'finance-hub', 101, true)
ON CONFLICT DO NOTHING;

-- Trader Hub - missing (helpers)
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('coin-trader-hub', 'Coin Trader Hub', 'trader-hub', 49, true),
('helper-management', 'Helper Management', 'trader-hub', 53, true),
('helper-applications', 'Helper Applications', 'trader-hub', 54, true),
('helper-requests', 'Helper Requests', 'trader-hub', 55, true),
('helper-orders', 'Helper Orders', 'trader-hub', 56, true),
('level5-helpers', 'Level 5 Helpers', 'trader-hub', 57, true),
('helper-diamond-pricing', 'Helper Diamond Pricing', 'trader-hub', 58, true)
ON CONFLICT DO NOTHING;

-- Game Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('game-management', 'Game Management', 'game-hub', 69, true),
('game-server', 'Game Server', 'game-hub', 72, true)
ON CONFLICT DO NOTHING;

-- Content Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('content-management', 'Content Management', 'content-hub', 89, true),
('content-pages', 'Content Pages', 'content-hub', 93, true),
('streams', 'Streams', 'content-hub', 94, true),
('tasks-settings', 'Task Center', 'content-hub', 95, true),
('rewards-management', 'Rewards Management', 'content-hub', 96, true)
ON CONFLICT DO NOTHING;

-- Party Hub - missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('party-management', 'Party Management', 'party-hub', 79, true),
('room-welcome-messages', 'Room Welcome Messages', 'party-hub', 83, true)
ON CONFLICT DO NOTHING;

-- Moderation Hub (Support) - NEW hub, all missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('support-tickets', 'Support Tickets', 'moderation-hub', 110, true),
('chat-inspector', 'Chat Inspector', 'moderation-hub', 111, true),
('number-sharing', 'Number Sharing', 'moderation-hub', 112, true)
ON CONFLICT DO NOTHING;

-- Settings Hub - all missing
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('call-settings', 'Call Settings', 'settings-hub', 120, true),
('push-broadcast', 'Push Broadcast', 'settings-hub', 121, true),
('notice-broadcast', 'Notice Broadcast', 'settings-hub', 122, true),
('notification-templates', 'Notification Templates', 'settings-hub', 123, true),
('app-settings-hub', 'App Settings Hub', 'settings-hub', 130, true),
('general-settings', 'General Settings', 'settings-hub', 131, true),
('agora-settings', 'Agora RTC', 'settings-hub', 132, true),
('branding', 'Branding', 'settings-hub', 133, true),
('invitation-settings', 'Invitation Settings', 'settings-hub', 134, true),
('popup-banners', 'Popup Event Banners', 'settings-hub', 135, true),
('app-version', 'App Version', 'settings-hub', 136, true),
('device-management', 'Device Management', 'settings-hub', 137, true)
ON CONFLICT DO NOTHING;

-- Reports
INSERT INTO public.admin_sections (section_key, section_name, hub_key, display_order, is_active) VALUES
('reports', 'Reports & Analytics', null, 1, true)
ON CONFLICT DO NOTHING;
