
-- Add icon_emoji and image_url columns expected by admin UI
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS icon_emoji text,
  ADD COLUMN IF NOT EXISTS image_url text;

-- Re-categorize the 15 push_* templates into their proper systems
UPDATE public.notification_templates SET category = 'push_host'
  WHERE template_key IN ('push_host_1','push_host_2','push_host_3','push_host_4','push_host_5');
UPDATE public.notification_templates SET category = 'push_inviter'
  WHERE template_key IN ('push_inviter_1','push_inviter_2','push_inviter_3','push_inviter_4','push_inviter_5');
UPDATE public.notification_templates SET category = 'push_live'
  WHERE template_key IN ('push_live_1','push_live_2','push_live_3','push_live_4','push_live_5');

-- Seed premium 3D PNG image_url + curated icon_emoji for all 15 templates
UPDATE public.notification_templates SET
  image_url = '/images/premium-notifications/face-verification-3d.png',
  icon_emoji = '🪪'
  WHERE template_key = 'push_host_3';

UPDATE public.notification_templates SET
  image_url = '/images/premium-notifications/live-reward-3d.png',
  icon_emoji = '🎤'
  WHERE template_key IN ('push_host_1','push_host_2','push_host_5');

UPDATE public.notification_templates SET
  image_url = '/images/premium-notifications/vip-crown-3d.png',
  icon_emoji = '👑'
  WHERE template_key = 'push_host_4';

UPDATE public.notification_templates SET
  image_url = '/images/premium-notifications/referral-gift-3d.png',
  icon_emoji = '🎁'
  WHERE template_key IN ('push_inviter_1','push_inviter_2','push_inviter_3','push_inviter_4','push_inviter_5');

UPDATE public.notification_templates SET
  image_url = '/images/premium-notifications/live-reward-3d.png',
  icon_emoji = '⏰'
  WHERE template_key IN ('push_live_1','push_live_3','push_live_5');

UPDATE public.notification_templates SET
  image_url = '/images/premium-notifications/recharge-mega-3d.png',
  icon_emoji = '🔥'
  WHERE template_key IN ('push_live_2','push_live_4');
