-- Insert 10 professional level frames for levels 1-10
-- These are CSS-based frames, so frame_url will contain a reference identifier

DELETE FROM avatar_frames WHERE name LIKE 'Level % Frame';

INSERT INTO avatar_frames (name, frame_url, min_level, animation_type, is_active, is_premium, display_order) VALUES
('Level 1 Frame', 'level-1-blue-basic', 1, 'pulse', true, false, 1),
('Level 2 Frame', 'level-2-green-glow', 2, 'glow', true, false, 2),
('Level 3 Frame', 'level-3-purple-shimmer', 3, 'shimmer', true, false, 3),
('Level 4 Frame', 'level-4-pink-shimmer', 4, 'shimmer', true, true, 4),
('Level 5 Frame', 'level-5-gold-glow', 5, 'glow', true, true, 5),
('Level 6 Frame', 'level-6-orange-fire', 6, 'fire', true, true, 6),
('Level 7 Frame', 'level-7-red-fire', 7, 'fire', true, true, 7),
('Level 8 Frame', 'level-8-diamond-rainbow', 8, 'rainbow', true, true, 8),
('Level 9 Frame', 'level-9-supreme-rainbow', 9, 'rainbow', true, true, 9),
('Level 10 Frame', 'level-10-immortal-rainbow', 10, 'rainbow', true, true, 10);