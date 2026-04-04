UPDATE app_version_settings 
SET 
  current_version_code = 21,
  current_version_name = '7.0.6',
  update_message = 'MeriLive v7.0.6 🎉

• Live streaming with beauty filters & stickers
• Audio/Video party rooms
• PK Battle with random matching
• Private video & audio calls
• Real-time chat & gifting
• Coin, Diamond & VIP system
• Push notifications & call alerts
• Live games & entertainment

Bug fixes & performance improvements.',
  updated_at = now()
WHERE platform = 'android';