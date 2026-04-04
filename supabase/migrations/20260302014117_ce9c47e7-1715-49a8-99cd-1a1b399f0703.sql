
-- Update all 12 themes with live-streaming-app-grade premium colors

UPDATE app_event_themes SET
  primary_color = '42 100% 62%',
  secondary_color = '280 100% 65%',
  accent_color = '42 100% 70%',
  nav_bg_color = '250 30% 6%',
  nav_active_color = '42 100% 65%',
  tab_active_color = '42 100% 62%',
  card_border_color = '42 80% 50%',
  header_gradient_from = '260 50% 8%',
  header_gradient_to = '42 40% 6%',
  floating_particles = ARRAY['🌙','⭐','✨','🕌','💫'],
  description = 'Royal golden crescent & midnight purple — Bigo-grade luxury Ramadan'
WHERE theme_key = 'ramadan';

UPDATE app_event_themes SET
  primary_color = '145 100% 50%',
  secondary_color = '42 100% 60%',
  accent_color = '145 90% 60%',
  nav_bg_color = '160 40% 5%',
  nav_active_color = '145 100% 55%',
  tab_active_color = '145 100% 50%',
  card_border_color = '145 70% 40%',
  header_gradient_from = '160 50% 8%',
  header_gradient_to = '42 30% 6%',
  floating_particles = ARRAY['🎉','🌙','✨','🎊','💚'],
  description = 'Neon emerald & gold burst — festival energy Eid celebration'
WHERE theme_key = 'eid_fitr';

UPDATE app_event_themes SET
  primary_color = '38 100% 55%',
  secondary_color = '20 90% 50%',
  accent_color = '45 100% 65%',
  nav_bg_color = '25 35% 6%',
  nav_active_color = '38 100% 60%',
  tab_active_color = '38 100% 55%',
  card_border_color = '38 80% 45%',
  header_gradient_from = '20 40% 8%',
  header_gradient_to = '38 25% 5%',
  floating_particles = ARRAY['🐑','⭐','✨','🌙','🕌'],
  description = 'Premium amber-gold with warm bronze glow — rich elegant Eid'
WHERE theme_key = 'eid_adha';

UPDATE app_event_themes SET
  primary_color = '0 100% 55%',
  secondary_color = '140 100% 40%',
  accent_color = '45 100% 60%',
  nav_bg_color = '140 40% 5%',
  nav_active_color = '0 100% 58%',
  tab_active_color = '0 100% 55%',
  card_border_color = '0 70% 45%',
  header_gradient_from = '140 45% 8%',
  header_gradient_to = '0 30% 6%',
  floating_particles = ARRAY['❄️','🎄','⭐','🎅','🎁'],
  description = 'Electric red & forest green — live streaming holiday neon Christmas'
WHERE theme_key = 'christmas';

UPDATE app_event_themes SET
  primary_color = '270 100% 65%',
  secondary_color = '200 100% 60%',
  accent_color = '45 100% 65%',
  nav_bg_color = '270 35% 5%',
  nav_active_color = '270 100% 70%',
  tab_active_color = '270 100% 65%',
  card_border_color = '270 70% 50%',
  header_gradient_from = '270 50% 10%',
  header_gradient_to = '200 30% 6%',
  floating_particles = ARRAY['🎆','🎇','✨','🎊','💜'],
  description = 'Ultra neon purple & electric blue — party mode New Year countdown'
WHERE theme_key = 'new_year';

UPDATE app_event_themes SET
  primary_color = '340 100% 60%',
  secondary_color = '320 100% 55%',
  accent_color = '350 100% 70%',
  nav_bg_color = '340 40% 5%',
  nav_active_color = '340 100% 63%',
  tab_active_color = '340 100% 60%',
  card_border_color = '340 80% 50%',
  header_gradient_from = '330 50% 10%',
  header_gradient_to = '350 30% 5%',
  floating_particles = ARRAY['💕','❤️','💖','🌹','💗'],
  description = 'Hot pink neon love glow — Valentine crush mode with electric hearts'
WHERE theme_key = 'valentine';

UPDATE app_event_themes SET
  primary_color = '30 100% 55%',
  secondary_color = '45 100% 60%',
  accent_color = '15 100% 60%',
  nav_bg_color = '20 40% 5%',
  nav_active_color = '30 100% 58%',
  tab_active_color = '30 100% 55%',
  card_border_color = '30 80% 45%',
  header_gradient_from = '15 45% 8%',
  header_gradient_to = '30 25% 5%',
  floating_particles = ARRAY['🪔','✨','🎆','🔥','💛'],
  description = 'Deep orange flame & golden fire — Diwali festival of lights premium'
WHERE theme_key = 'diwali';

UPDATE app_event_themes SET
  primary_color = '0 100% 50%',
  secondary_color = '45 100% 55%',
  accent_color = '15 100% 55%',
  nav_bg_color = '0 35% 5%',
  nav_active_color = '0 100% 55%',
  tab_active_color = '0 100% 50%',
  card_border_color = '0 70% 40%',
  header_gradient_from = '0 40% 8%',
  header_gradient_to = '45 25% 5%',
  floating_particles = ARRAY['🔱','🌺','✨','🪷','❤️'],
  description = 'Vermilion red & gold sindoor — Durga Puja divine power theme'
WHERE theme_key = 'durga_puja';

UPDATE app_event_themes SET
  primary_color = '25 100% 55%',
  secondary_color = '280 100% 50%',
  accent_color = '120 100% 50%',
  nav_bg_color = '280 40% 4%',
  nav_active_color = '25 100% 58%',
  tab_active_color = '25 100% 55%',
  card_border_color = '280 60% 40%',
  header_gradient_from = '280 45% 8%',
  header_gradient_to = '25 25% 5%',
  floating_particles = ARRAY['🎃','👻','🦇','💀','🕸️'],
  description = 'Neon orange & toxic purple — spooky Halloween live streaming edition'
WHERE theme_key = 'halloween';

UPDATE app_event_themes SET
  primary_color = '25 90% 50%',
  secondary_color = '35 80% 55%',
  accent_color = '15 85% 55%',
  nav_bg_color = '20 35% 5%',
  nav_active_color = '25 90% 55%',
  tab_active_color = '25 90% 50%',
  card_border_color = '25 60% 40%',
  header_gradient_from = '20 35% 8%',
  header_gradient_to = '35 20% 5%',
  floating_particles = ARRAY['🍂','🍁','🦃','✨','🌾'],
  description = 'Warm autumn amber & burnt orange — cozy Thanksgiving harvest glow'
WHERE theme_key = 'thanksgiving';

UPDATE app_event_themes SET
  primary_color = '330 100% 65%',
  secondary_color = '280 100% 60%',
  accent_color = '180 100% 55%',
  nav_bg_color = '300 35% 5%',
  nav_active_color = '330 100% 68%',
  tab_active_color = '330 100% 65%',
  card_border_color = '330 70% 50%',
  header_gradient_from = '280 45% 10%',
  header_gradient_to = '330 25% 5%',
  floating_particles = ARRAY['🌸','🦋','✨','💐','🌷'],
  description = 'Sakura pink & violet bloom — spring blossom neon party theme'
WHERE theme_key = 'spring';

UPDATE app_event_themes SET
  primary_color = '145 100% 45%',
  secondary_color = '0 100% 50%',
  accent_color = '45 100% 55%',
  nav_bg_color = '145 40% 5%',
  nav_active_color = '145 100% 50%',
  tab_active_color = '145 100% 45%',
  card_border_color = '145 70% 35%',
  header_gradient_from = '145 45% 8%',
  header_gradient_to = '0 25% 5%',
  floating_particles = ARRAY['🇧🇩','⭐','✨','🎆','💚'],
  description = 'Electric green & red patriotic glow — Bangladesh Independence pride'
WHERE theme_key = 'independence';
