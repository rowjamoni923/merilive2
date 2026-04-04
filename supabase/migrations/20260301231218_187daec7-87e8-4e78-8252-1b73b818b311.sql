INSERT INTO admin_sections (section_key, section_name, section_name_bn, hub_key, icon_name, display_order, is_active)
VALUES ('gmail-support', 'Gmail Support', 'জিমেইল সাপোর্ট', 'moderation-hub', 'Mail', 123, true)
ON CONFLICT (section_key) DO NOTHING;