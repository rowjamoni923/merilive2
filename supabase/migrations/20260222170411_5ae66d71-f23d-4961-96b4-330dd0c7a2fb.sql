-- Insert the luxury popup event banner
INSERT INTO popup_event_banners (
  title,
  description,
  image_url,
  link_url,
  link_type,
  display_duration_seconds,
  is_active,
  display_order,
  skip_delay_seconds,
  auto_dismiss_seconds
) VALUES (
  '💎 100,000+ Diamonds Bonus',
  'ইনভাইট করলে ১ লক্ষ ডায়মন্ড বোনাস! ৫ ঘণ্টা লাইভ করলে $10 বোনাস!',
  '/images/popup-event-banner-invite.png',
  '/home',
  'internal',
  10,
  true,
  1,
  3,
  15
);