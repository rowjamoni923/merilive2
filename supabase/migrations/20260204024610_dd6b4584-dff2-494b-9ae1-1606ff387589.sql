-- Insert image-based party room backgrounds
INSERT INTO party_room_backgrounds (name, image_url, gradient_css, category, is_premium, is_active, price_diamonds, display_order)
VALUES
  ('Nature', 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800', NULL, 'free', false, true, 0, 1),
  ('Galaxy', 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800', NULL, 'free', false, true, 0, 2),
  ('Sunset', 'https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800', NULL, 'free', false, true, 0, 3),
  ('Ocean', 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800', NULL, 'free', false, true, 0, 4),
  ('Forest', 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800', NULL, 'free', false, true, 0, 5),
  ('Mountains', 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800', NULL, 'free', false, true, 0, 6),
  ('Desert', 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800', NULL, 'free', false, true, 0, 7),
  ('Abstract', 'https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=800', NULL, 'free', false, true, 0, 8),
  ('Neon City', 'https://images.unsplash.com/photo-1557683316-973673baf926?w=800', NULL, 'premium', true, true, 500, 9),
  ('Night City', 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800', NULL, 'premium', true, true, 800, 10),
  ('Aurora', 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800', NULL, 'premium', true, true, 1000, 11),
  ('Sakura', 'https://images.unsplash.com/photo-1522383225653-ed111181a951?w=800', NULL, 'premium', true, true, 1200, 12);