-- banners: 2 rows
INSERT INTO public.banners (id, title, image_url, link_url, display_order, is_active, start_date, end_date, created_at, updated_at) VALUES
('5f6e8cac-f0de-4d16-9065-eaf3b1b84eca', 'Agency Recruitment', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/banners/banner_1771798683229.jfif', 'https://merilive.com/agency-signup', 1, true, '2026-02-22 00:00:00+00', '2026-09-23 00:00:00+00', '2026-02-22 22:18:23.514239+00', '2026-03-04 15:03:03.307087+00'),
('a3295844-2b77-4498-9da1-fe485f9f4713', 'Go live Hours 10$ bonus', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/banners/banner_1771507459583.jpg', '/google-library-order-rules', 2, true, NULL, NULL, '2026-02-19 13:20:59.795362+00', '2026-02-22 23:21:19.98343+00')
ON CONFLICT DO NOTHING;

-- beauty_filters: 18 rows
INSERT INTO public.beauty_filters (id, name, category, file_url, is_active, is_free, display_order, created_at) VALUES
('e3837eb9-586a-42dd-a7da-d8e356570d4c', 'Beauty Smooth', 'beauty', '/effects/beauty.deepar', true, true, 1, '2026-03-07 12:48:16.963158+00'),
('18885a34-0343-48d4-a41f-2f3abb0c5250', 'Beauty Smooth', 'beauty', '/effects/beauty.deepar', true, true, 1, '2026-03-07 12:48:42.998668+00'),
('e016bf0b-abc7-4469-8f6b-80f59496f3a4', 'Cracked Porcelain', 'filter', '/effects/cracked_porcelain.deepar', true, true, 2, '2026-03-07 12:48:16.963158+00'),
('9ef8f364-70b7-40c3-8a17-d425f43ca516', 'Cracked Porcelain', 'filter', '/effects/cracked_porcelain.deepar', true, true, 2, '2026-03-07 12:48:42.998668+00'),
('5ead49f2-006c-4fd8-a694-c15b3cd6c5f8', 'Glasses 2023', 'accessories', '/effects/glasses_2023.deepar', true, true, 3, '2026-03-07 12:48:16.963158+00'),
('f3674c91-85da-4112-b45b-67e4dc184568', 'Glasses 2023', 'accessories', '/effects/glasses_2023.deepar', true, true, 3, '2026-03-07 12:48:42.998668+00'),
('ee5cbfba-0f29-4c58-a19e-16fe99c088f5', 'Lightbulb', 'fun', '/effects/lightbulb.deepar', true, true, 4, '2026-03-07 12:48:16.963158+00'),
('69c3f42d-3133-4cc1-8f90-90baf0f3b42b', 'Lightbulb', 'fun', '/effects/lightbulb.deepar', true, true, 4, '2026-03-07 12:48:42.998668+00'),
('44522d3e-dbd3-46b5-a3f3-c95e7b5141a6', 'Sequin Butterfly', 'sticker', '/effects/sequin_butterfly.deepar', true, true, 5, '2026-03-07 12:48:16.963158+00'),
('fa41d78e-bed5-4417-954f-ae83e8f12109', 'Sequin Butterfly', 'sticker', '/effects/sequin_butterfly.deepar', true, true, 5, '2026-03-07 12:48:42.998668+00'),
('f8487c52-e0d3-4f5d-b607-401c64429280', 'Spring Fairy', 'filter', '/effects/spring_fairy.deepar', true, true, 6, '2026-03-07 12:48:16.963158+00'),
('e5faf87b-1fc6-4803-8bd0-f22b0c23bb6b', 'Spring Fairy', 'filter', '/effects/spring_fairy.deepar', true, true, 6, '2026-03-07 12:48:42.998668+00'),
('09596ce7-70b8-4399-b755-40ec42bf5e02', 'Background Blur', 'beauty', '/effects/background_blur.deepar', true, true, 7, '2026-03-07 12:50:20.947856+00'),
('d1da6790-17bf-4c35-803f-e95aa3b2bbc8', 'Cartoon Avatar', 'fun', '/effects/cartoon_avatar.deepar', true, true, 8, '2026-03-07 12:50:20.947856+00'),
('67c67625-ade2-45ac-8e4a-65389b3e4620', 'Extreme Makeover', 'beauty', '/effects/extreme_makeover.deepar', true, true, 9, '2026-03-07 12:50:20.947856+00'),
('8392d774-dc83-44e4-b538-7202c7f90d65', 'Eye Color', 'makeup', '/effects/eye_color.deepar', true, true, 10, '2026-03-07 12:50:20.947856+00'),
('8e0303d0-f51a-47de-8a8a-66f3bc33c3be', 'Sunglasses', 'accessories', '/effects/sunglasses.deepar', true, true, 11, '2026-03-07 12:50:20.947856+00'),
('dfd2051d-6b63-4392-b3ba-4eec5e48d141', 'Video Filter', 'filter', '/effects/video_filter.deepar', true, true, 12, '2026-03-07 12:50:20.947856+00')
ON CONFLICT DO NOTHING;

-- categories: 11 rows
INSERT INTO public.categories (id, name, slug, icon_url, description, display_order, is_active, created_at) VALUES
('3af43510-88b1-4415-86aa-20bf10763c29', 'News', 'news', 'Newspaper', NULL, 1, true, '2026-01-17 17:02:05.493938+00'),
('516cb337-a130-455f-9f77-955298b91d20', 'Entertainment', 'entertainment', 'Film', NULL, 2, true, '2026-01-17 17:02:05.493938+00'),
('35be9805-ff77-42b9-b254-5ec435e3976a', 'Sports', 'sports', 'Trophy', NULL, 3, true, '2026-01-17 17:02:05.493938+00'),
('19f749ee-b52b-4846-9f5a-961830dfcd59', 'Movies', 'movies', 'Clapperboard', NULL, 4, true, '2026-01-17 17:02:05.493938+00'),
('70367108-285a-44ef-ad5d-c7a9dd122551', 'Music', 'music', 'Music', NULL, 5, true, '2026-01-17 17:02:05.493938+00'),
('17a0162d-8751-4c76-b954-30673d8451e6', 'Kids', 'kids', 'Baby', NULL, 6, true, '2026-01-17 17:02:05.493938+00'),
('d4409ad9-908b-4ba8-83d6-5f5544e5e874', 'Religious', 'religious', 'Church', NULL, 7, true, '2026-01-17 17:02:05.493938+00'),
('305fc3ab-2a02-41e3-b2b6-6b8407f13b72', 'Documentary', 'documentary', 'BookOpen', NULL, 8, true, '2026-01-17 17:02:05.493938+00'),
('081d1726-f620-44e3-a181-3d5b20b95fc1', 'Lifestyle', 'lifestyle', 'Heart', NULL, 9, true, '2026-01-17 17:02:05.493938+00'),
('b11010c9-5121-4b52-81ac-1e82da7a8df5', 'Business', 'business', 'Briefcase', NULL, 10, true, '2026-01-17 17:02:05.493938+00'),
('4f3bda61-c3b5-4be6-b737-ce57b4e3317d', 'Education', 'education', 'GraduationCap', NULL, 11, true, '2026-01-17 17:02:05.493938+00')
ON CONFLICT DO NOTHING;

-- channels: 82 rows
INSERT INTO public.channels (id, name, logo_url, stream_url, description, is_live, is_active, viewer_count, created_at) VALUES
('277254ba-4141-4fb7-915d-3f8c3dba25e3', 'Maasranga TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/maabortvhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('c997a749-e43f-4a98-a38b-4cd81b2f0968', 'Deepto TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/deepto/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('7543ddf1-91e2-49b6-93da-4428ea2d0fd9', 'SA TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sabortv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('02abd97b-a18e-45b4-a334-66d9802e337a', 'Gazi TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/gazitv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('93d3f993-bd3d-4ded-9a79-c61f957fb707', 'Star Sports 1', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/starsports1/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('dd031cd6-715f-4bc5-bf43-497e80e71cab', 'Star Sports 1 HD', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/starsports1hd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('315f032b-87d7-454b-86d5-b7751ad80744', 'Star Sports 2', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/starsports2/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('c48c7e67-b14b-45d8-8318-ec5b91978bbb', 'Sony TEN 1', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonyten1/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('b4921a9b-9790-41f6-ab82-16bfa9c0758c', 'Sony TEN 2', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonyten2/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('7c19f6d2-2e68-40c7-8d49-3c510e2ef19b', 'Sony TEN 3', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonyten3/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('af1eb3e4-2c5a-410d-a0f1-7f1af0823cd1', 'Sony SIX', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonysix/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('50121ac5-6d16-4aa2-b7e5-4b5ef7a88361', 'PTV Sports', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/ptvsports/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('1bf4425a-d199-42d9-8b22-33e65017ed94', 'Geo Super', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/geosuper/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('26452746-ba77-416a-ae2b-356a581123f6', 'A Sports', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/asports/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('21ee677a-020c-4bdd-a4b5-6c1309fb89a3', 'Willow Cricket', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/willowcricket/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('30958e50-ef1a-423f-ba39-bc57a28b9d26', 'Sky Sports Cricket', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/skysportscricket/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('2d08f66d-1a99-4811-b753-36b33d501011', 'Sky Sports Main', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/skysportsmain/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('67043353-f746-4c9b-a89b-34e4013f562b', 'BT Sport 1', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/btsport1/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('e1be089d-a3a2-4a89-ad8b-2286fcdf55a7', 'BT Sport 2', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/btsport2/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('67186c6c-94b4-4edd-ac62-d5ebd277d956', 'TNT Sports 1', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/tntsports1/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('c91a6de5-3b52-47f1-8d31-9dcd1cb2f61e', 'TNT Sports 2', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/tntsports2/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('50e9d94f-cd61-4581-8e6c-a4549400d76b', 'ESPN', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/espn/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('7fdb5558-a9b5-4309-8449-eb321aaebd76', 'Fox Sports', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/foxsports/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('82f97a3e-eeda-414a-8ee4-95ecc9eab6f4', 'NBC Sports', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/nbcsports/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('99b25ec7-cb67-413f-98f8-ff32e48ccaff', 'Eurosport 1', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/eurosport1/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('4a27c2f7-d1e8-43e4-8e59-5e6a208ba7a3', 'BeIN Sports 1', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/beinsports1/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:51:32.771542+00'),
('33f369a7-fb89-46e9-9ab7-a3aad24f0cb4', 'Somoy TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/somoyhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('c964e3d8-db83-4dbc-bcd6-f0e99e8bcef3', 'Independent TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/independenthd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('02dba9e3-0a5f-46e0-bd39-2dc3f1e8e80f', 'Channel 24', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/channel24/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('4d3a7e05-41e1-4e3e-aba2-f6e1b72e3b77', 'NTV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/ntvhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('46361a3f-c1c3-4a5f-9193-dab8b3a02b5f', 'RTV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/rtvhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('0f44b4b8-46d8-4e40-af7f-c88e4a5ddf29', 'Jamuna TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/jamunahd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('3a5a1b90-47bb-4e97-a34e-e1eb6d07c56d', 'Ekattor TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/ekattortv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('c5fcba21-3e5e-4379-89d8-08e455e0e0ee', 'News24', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/news24/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('ca77b0e1-d22e-497e-b75d-83f5f6a03744', 'DBC News', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/dbcnews/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('14b25395-2df7-4989-9fd7-5f2d0e3a444b', 'BTV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/btvhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('abf6f76e-4f34-4849-a968-4e6a1208d2f0', 'BTV World', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/btvworld/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('e9b1c3ce-7cf9-434a-a2f2-d9cd5d72f4f7', 'Boishakhi TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/boishakhitv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('b7e0f6ef-45e7-407e-b85c-48fbcffc37e1', 'Bangla Vision', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/banglavision/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('76f2a0c9-41bc-4d0a-b84c-7e5f6ee91bff', 'ATN News', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/atnnews/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('ee1fd78b-1dcd-476f-9a3d-14f6b9bb9a8d', 'ATN Bangla', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/atnbangla/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('4b9b3434-da38-4cd0-ad59-d81f3420f52c', 'Asian TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/asiantv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('8e8fb8fd-ffa8-4b07-bc95-9b0b3af54f0a', 'Nagorik TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/nagoriktv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('cff1ffa0-e72f-4ef3-9c5a-57d88e1c5cd3', 'Duronto TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/durontotv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('bd794c31-1dc4-47a9-a6fe-3d7b2e8127f9', 'Gtv', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/gabortvhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('f22f0b07-0e28-4e3d-8b92-ebcbeee01b69', 'Channel i', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/channelihd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('79e0e3ea-5d10-45f9-b6ed-b9a3f6e6cf0c', 'Zee Bangla', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/zeebangla/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('ade7a7db-0b47-44e7-af68-af4a4c7e6aa8', 'Star Jalsha', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/starjalsha/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('3c8f1ff8-b0e1-4b38-b5e0-cb67614e9b66', 'Colors Bangla', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/colorsbangla/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('0eb1e1e3-a3a3-4ec0-89fb-aeacc6b6a93a', 'Star Plus', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/starplus/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('aab3f96c-b01e-4e50-a5b1-b7b5b7e77fe1', 'Sony TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonytv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('88fc9a19-e78f-440b-ad48-05b1f11e4c00', 'Colors TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/colorstv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('ebaf9e82-1fe1-48fb-b2f4-b4b37d1ddfc2', 'Zee TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/zeetv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('06a0e21e-3e05-4e68-ba40-c34aed0e3db2', 'Sony SAB', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonysab/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('8cf3ca9b-6b76-428e-8fdc-fb15a5b4b74b', 'Star Bharat', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/starbharat/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('a89ddd57-3fb9-48e6-9a79-1c29e0dce8c1', 'Colors Rishtey', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/colorsrishtey/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('96d1eee9-f94c-442e-8ff1-1f9a2b82e38b', 'Zee Cinema', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/zeecinema/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('b22f8e1e-02af-417f-a413-32c4dea0c1e3', 'Star Gold', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/stargold/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('5b5b3add-e4c2-4dbd-9fef-16b019e16d62', 'Sony MAX', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/sonymax/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('c95e5f20-3455-4fcf-9e04-e2d994df4a3b', 'Cartoon Network', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/cartoonnetwork/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('d9c82e81-1c60-46e3-827f-88a2a4f2d7c1', 'Disney Channel', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/disneychannel/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('1ee8a1ad-1b24-42c6-89ab-f5a8b4b7c8a2', 'Nick', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/nick/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('5b0ee655-6f2d-42b1-9c98-e59a2ab1f1e4', 'Hungama TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/hungamatv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('eaf53fd6-c7b1-4a9f-8ed4-d1893c1e3bf2', 'CBEEBIES', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/cbeebies/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('92b8f92c-64d8-402c-a2a7-60cf4a44a2b4', 'Discovery Channel', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/discoverychannel/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('dc2e8c57-a87a-4e1e-9d6f-84e4e3f0c231', 'National Geographic', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/natgeo/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('7a1ef8e9-e9e2-4c6e-b5de-9c3a3bc0b7f3', 'Animal Planet', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/animalplanet/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('28c95e73-7b5c-4c87-8a13-d7cf8e6a5e7f', 'History Channel', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/historychannel/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('f7f2e567-e0a4-4acb-b3d0-6f1d1e1c4b3a', 'Al Jazeera', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/aljazeera/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('ef1c2d3e-4f5a-6b7c-8d9e-0f1a2b3c4d5e', 'BBC World', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/bbcworld/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'CNN', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/cnn/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('1a2b3c4d-5e6f-7890-abcd-ef0123456789', 'Sky News', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/skynews/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('2b3c4d5e-6f7a-8901-bcde-f01234567890', 'Peace TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/peacetv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('3c4d5e6f-7a8b-9012-cdef-012345678901', 'Madani Channel', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/madanichannel/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('4d5e6f7a-8b9c-0123-def0-123456789012', 'Quran TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/qurantv/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('5e6f7a8b-9c0d-1234-ef01-234567890123', 'T Sports', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/tsportshd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00'),
('6f7a8b9c-0d1e-2345-f012-345678901234', 'Willow TV', NULL, 'https://us170.jagobd.com:447/c3VydmVyX8RpMCC4N6UP/stream/willowtvhd/playlist.m3u8', NULL, true, true, 0, '2026-01-18 00:48:35.009955+00')
ON CONFLICT DO NOTHING;

-- consumption_return_config: 4 rows
INSERT INTO public.consumption_return_config (id, min_consumption, return_percentage, is_active, created_at, updated_at) VALUES
('4d48e61a-fb56-4db0-8f76-98a2ecb4e8eb', 1000, 5, true, '2026-03-23 02:06:33.485899+00', '2026-03-23 02:06:33.485899+00'),
('9319e83d-c725-4e25-85be-2a36f1e78c35', 5000, 8, true, '2026-03-23 02:06:33.485899+00', '2026-03-23 02:06:33.485899+00'),
('56e8e52a-3e54-4590-a6b8-43e86d93b1b1', 20000, 12, true, '2026-03-23 02:06:33.485899+00', '2026-03-23 02:06:33.485899+00'),
('39e30df0-e3e1-4a42-95f4-65e57b22e9ce', 50000, 15, true, '2026-03-23 02:06:33.485899+00', '2026-03-23 02:06:33.485899+00')
ON CONFLICT DO NOTHING;

-- currency_rates: 31 rows
INSERT INTO public.currency_rates (id, currency_code, rate_to_usd, is_active, updated_at) VALUES
('ffcf3bc4-52f2-4519-8b77-6ce1f9e79854', 'BDT', 110, true, '2026-02-23 12:05:32.46131+00'),
('b5e3afdf-c5b6-4b38-8a74-bba9ca97cf17', 'INR', 83, true, '2026-02-23 12:05:32.46131+00'),
('dfe439a0-cd2a-48e7-a85b-e4a45b8f8614', 'PKR', 280, true, '2026-02-23 12:05:32.46131+00'),
('1f93e04b-46ed-4a5f-867f-ab4e2a2f6c3f', 'NPR', 133, true, '2026-02-23 12:05:32.46131+00'),
('5b68d2bd-8f3a-4f54-84c1-7e2a167d0a5c', 'LKR', 310, true, '2026-02-23 12:05:32.46131+00'),
('35de07a8-dbc2-4e4b-97c2-a39d6eea8ce7', 'MMK', 2100, true, '2026-02-23 12:05:32.46131+00'),
('a4f3d2c1-b5e6-7890-cdef-123456789abc', 'AED', 3.67, true, '2026-02-23 12:05:32.46131+00'),
('b5a4c3d2-e1f0-9876-dcba-0987654321fe', 'SAR', 3.75, true, '2026-02-23 12:05:32.46131+00'),
('c6b5d4e3-f2a1-0987-edcb-1098765432ef', 'KWD', 0.31, true, '2026-02-23 12:05:32.46131+00'),
('d7c6e5f4-a3b2-1098-fedc-2109876543fa', 'QAR', 3.64, true, '2026-02-23 12:05:32.46131+00'),
('e8d7f6a5-b4c3-2109-afed-3210987654ab', 'BHD', 0.376, true, '2026-02-23 12:05:32.46131+00'),
('f9e8a7b6-c5d4-3210-baef-4321098765bc', 'OMR', 0.385, true, '2026-02-23 12:05:32.46131+00'),
('0a1b2c3d-4e5f-6789-0abc-def012345678', 'MYR', 4.47, true, '2026-02-23 12:05:32.46131+00'),
('1b2c3d4e-5f6a-7890-1bcd-ef0123456789', 'SGD', 1.34, true, '2026-02-23 12:05:32.46131+00'),
('2c3d4e5f-6a7b-8901-2cde-f01234567890', 'THB', 35.5, true, '2026-02-23 12:05:32.46131+00'),
('3d4e5f6a-7b8c-9012-3def-012345678901', 'IDR', 15700, true, '2026-02-23 12:05:32.46131+00'),
('4e5f6a7b-8c9d-0123-4ef0-123456789012', 'PHP', 56.5, true, '2026-02-23 12:05:32.46131+00'),
('5f6a7b8c-9d0e-1234-5fa1-234567890123', 'EUR', 0.92, true, '2026-02-23 12:05:32.46131+00'),
('6a7b8c9d-0e1f-2345-6ab2-345678901234', 'GBP', 0.79, true, '2026-02-23 12:05:32.46131+00'),
('7b8c9d0e-1f2a-3456-7bc3-456789012345', 'CAD', 1.36, true, '2026-02-23 12:05:32.46131+00'),
('8c9d0e1f-2a3b-4567-8cd4-567890123456', 'AUD', 1.54, true, '2026-02-23 12:05:32.46131+00'),
('9d0e1f2a-3b4c-5678-9de5-678901234567', 'JPY', 149.5, true, '2026-02-23 12:05:32.46131+00'),
('0e1f2a3b-4c5d-6789-0ef6-789012345678', 'KRW', 1320, true, '2026-02-23 12:05:32.46131+00'),
('1f2a3b4c-5d6e-7890-1fa7-890123456789', 'CNY', 7.24, true, '2026-02-23 12:05:32.46131+00'),
('2a3b4c5d-6e7f-8901-2ab8-901234567890', 'TRY', 30.5, true, '2026-02-23 12:05:32.46131+00'),
('3b4c5d6e-7f8a-9012-3bc9-012345678901', 'EGP', 30.9, true, '2026-02-23 12:05:32.46131+00'),
('4c5d6e7f-8a9b-0123-4cd0-123456789012', 'NGN', 1550, true, '2026-02-23 12:05:32.46131+00'),
('5d6e7f8a-9b0c-1234-5de1-234567890123', 'ZAR', 18.7, true, '2026-02-23 12:05:32.46131+00'),
('6e7f8a9b-0c1d-2345-6ef2-345678901234', 'BRL', 4.97, true, '2026-02-23 12:05:32.46131+00'),
('7f8a9b0c-1d2e-3456-7fa3-456789012345', 'MXN', 17.1, true, '2026-02-23 12:05:32.46131+00'),
('8a9b0c1d-2e3f-4567-8ab4-567890123456', 'USD', 1, true, '2026-02-23 12:05:32.46131+00')
ON CONFLICT DO NOTHING;

-- daily_login_rewards_config: 7 rows
INSERT INTO public.daily_login_rewards_config (id, day_number, reward_amount, reward_type, is_active, created_at) VALUES
('dd539b92-0c23-4ab2-8e50-f1b3c8d19256', 1, 50, 'coins', true, '2026-02-17 12:50:11.975709+00'),
('e0a59429-9e52-4da4-8ffc-d0ec7c69e4e5', 2, 100, 'coins', true, '2026-02-17 12:50:11.975709+00'),
('8e6cff48-1b7f-43eb-b2b1-6c7b3d78a0d0', 3, 150, 'coins', true, '2026-02-17 12:50:11.975709+00'),
('5e06ee97-2cf3-4a4f-b6ae-1a9b0e0f6aab', 4, 200, 'coins', true, '2026-02-17 12:50:11.975709+00'),
('4ea0e6ab-4a9e-42a5-ba53-c8c6abc6e3b1', 5, 300, 'coins', true, '2026-02-17 12:50:11.975709+00'),
('a0c28555-c0b1-4e7c-960a-78e2e2e7e68d', 6, 400, 'coins', true, '2026-02-17 12:50:11.975709+00'),
('3e4b51f1-8c2b-4e00-b1d1-c81b9d8e0c33', 7, 1000, 'coins', true, '2026-02-17 12:50:11.975709+00')
ON CONFLICT DO NOTHING;

-- daily_tasks: 11 rows
INSERT INTO public.daily_tasks (id, title, description, task_type, reward_coins, reward_xp, icon_name, display_order, is_active, created_at, required_count, min_level, target_gender) VALUES
('7b8c3ad5-e69d-4f3a-aeef-3c12ec2f0cce', 'Login Today', 'Open the app and login daily', 'daily_login', 50, 10, 'LogIn', 1, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('f5a3e7ec-b72f-491d-bb72-c52e1c4db8da', 'Watch 5 Minutes Live', 'Watch any live stream for 5 minutes', 'watch_live', 100, 20, 'Eye', 2, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('5d10aee3-2f26-4db0-8a75-a6e3c0c17e91', 'Send a Gift', 'Send any gift to a streamer', 'send_gift', 150, 30, 'Gift', 3, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('a6b6e6f1-7da5-4c8e-bf47-d0a9b7d0c58c', 'Share Profile', 'Share your profile with friends', 'share_profile', 75, 15, 'Share2', 4, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('cf3a8c4d-dd76-4e94-8c12-f5c6e5b3d7a9', 'Invite a Friend', 'Invite a new user to join', 'invite_friend', 200, 50, 'UserPlus', 5, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('d00e4c2b-efb4-4c9a-a87e-6a3c7e4cb48d', 'Complete Profile', 'Add avatar, bio and country', 'complete_profile', 300, 100, 'UserCheck', 6, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('a4e7c891-0b93-4c34-bbd6-5aff56e09917', 'Send Message', 'Send a message in chat', 'send_message', 50, 10, 'MessageCircle', 7, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('e6cc51e7-6f57-4b37-94b9-1b5a37de3c71', 'Join Party Room', 'Join any party room', 'join_party', 100, 25, 'PartyPopper', 8, true, '2026-02-17 12:37:58.652267+00', 1, NULL, NULL),
('b76fd31a-10af-428d-b2eb-8437dbbc5d3e', 'Go Live', 'Start a live stream', 'go_live', 500, 100, 'Radio', 9, true, '2026-02-17 12:37:58.652267+00', 1, NULL, 'female'),
('e7f0a9b8-c1d2-3e4f-5a6b-7c8d9e0f1a2b', 'Recharge Coins', 'Recharge any coin package', 'recharge', 100, 50, 'Coins', 10, true, '2026-02-17 12:37:58.652267+00', 1, NULL, 'male'),
('f8a1b0c9-d2e3-4f5a-6b7c-8d9e0f1a2b3c', 'Watch 3 Reels', 'Watch at least 3 short video reels', 'watch_reels', 75, 15, 'Play', 11, true, '2026-02-17 12:37:58.652267+00', 3, NULL, NULL)
ON CONFLICT DO NOTHING;

-- entry_name_bars: 13 rows
INSERT INTO public.entry_name_bars (id, name, image_url, is_active, is_premium, level_required, price_coins, price_diamonds, display_order, created_at, updated_at, animation_url) VALUES
('5e37c78b-45d3-4bdd-ba14-b19321267f30', 'Default Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/default_name.png', true, false, 0, 0, 0, 1, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('63aeeb5c-3c05-4db2-a1a1-5ac900d69c30', 'Bronze Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/bronze_name.png', true, false, 5, 0, 0, 2, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('37e113ab-d413-48a1-b1ac-b2f0eeef4f69', 'Silver Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/silver_name.png', true, false, 10, 0, 0, 3, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('61fd3dfc-4c61-44f8-9f35-ec39f19b9f70', 'Gold Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/gold_name.png', true, false, 15, 0, 0, 4, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('a8f7ab6e-2f3f-483d-9c71-f3ffb5e1eec5', 'Platinum Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/platinum_name.png', true, true, 20, 500, 50, 5, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('e16d9464-2568-4f9d-9c26-dd4a4eedd8e7', 'Diamond Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/diamond_name.png', true, true, 25, 1000, 100, 6, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('b4bd7fd9-a1b3-4d73-bc61-30a8d8f68e5c', 'Ruby Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/ruby_name.png', true, true, 30, 2000, 200, 7, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('bd3a219e-7bb0-4e0e-b2b1-0ccb12de5558', 'Crown Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/crown_name.png', true, true, 35, 3000, 300, 8, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('b2f2a398-be9f-4dbd-87e2-3eb5b66cef5c', 'Royal Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/royal_name.png', true, true, 40, 5000, 500, 9, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('a99ea84a-b0a1-4483-a395-1b5a9d05a7bc', 'Emperor Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/emperor_name.png', true, true, 45, 8000, 800, 10, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('94b3ae34-5de2-42b9-b3e1-72b0bbb23f95', 'Legend Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/legend_name.png', true, true, 50, 10000, 1000, 11, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('1bd32c27-e3ff-494b-b1d1-2ef430e8b79d', 'Celestial Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/celestial_name.png', true, true, 60, 15000, 1500, 12, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL),
('1c9ea8ac-05b2-48e0-8f76-f8d5ad5e8d91', 'Immortal Name', 'https://pppcwawjjpwwrmvezcdy.supabase.co/storage/v1/object/public/level-assets/entry-name-bars/immortal_name.png', true, true, 70, 20000, 2000, 13, '2026-02-17 11:55:36.498974+00', '2026-02-17 11:55:36.498974+00', NULL)
ON CONFLICT DO NOTHING;