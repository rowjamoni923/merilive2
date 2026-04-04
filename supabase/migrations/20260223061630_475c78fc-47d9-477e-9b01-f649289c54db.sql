-- Update app update messages to English
UPDATE public.app_version_settings 
SET update_message = '🎉 MeriLive v8.0.1 - Major Update!

• Incoming call screen with full-screen notifications
• Native push notifications  
• Google Play In-App Purchases
• Performance & stability improvements
• Bug fixes'
WHERE platform = 'android';

UPDATE public.app_version_settings 
SET update_message = 'A new update is available! Update now to get the latest features and improvements.'
WHERE platform = 'ios';