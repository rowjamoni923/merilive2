INSERT INTO public.notification_templates (
  template_key, title, body, title_template, message_template,
  category, icon_emoji, image_url, is_active, description
) VALUES (
  'app_update_available',
  '🚀 Update Available',
  'A new version of MeriLive is live on Play Store. Tap to update now and enjoy new features, better performance and a smoother live experience!',
  '🚀 Update Available — v{{version}}',
  'A new version of MeriLive is live on Play Store. Tap to update now and enjoy new features, better performance and a smoother live experience!',
  'system',
  '🚀',
  'https://merilive.top/__l5e/assets-v1/c36b4010-3dae-463c-940d-fb0526240202/merilive-update-push-banner.jpg',
  true,
  'Sent to all users when a new Play Store version of the app is released. Banner shown in FCM big-picture and iOS rich notification.'
)
ON CONFLICT (template_key) DO UPDATE
SET title = EXCLUDED.title,
    body = EXCLUDED.body,
    title_template = EXCLUDED.title_template,
    message_template = EXCLUDED.message_template,
    category = EXCLUDED.category,
    icon_emoji = EXCLUDED.icon_emoji,
    image_url = EXCLUDED.image_url,
    is_active = true,
    description = EXCLUDED.description,
    updated_at = now();