// Premium Gift Animation Data Store
// Contains 150 luxury gifts for live streaming (15 categories x 10 gifts each)

export interface GiftData {
  id: string;
  name: string;
  emoji: string;
  coins: number;
  category: string;
  animationType: 'basic' | 'premium' | 'luxury' | 'legendary';
  soundEffect?: string;
  description?: string;
}

export interface GiftCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
}

// 15 Gift Categories
export const giftCategories: GiftCategory[] = [
  { id: 'popular', name: 'Popular', icon: '🔥', color: 'from-orange-500 to-red-500', order: 1 },
  { id: 'love', name: 'Love', icon: '❤️', color: 'from-pink-500 to-rose-500', order: 2 },
  { id: 'flowers', name: 'Flowers', icon: '🌸', color: 'from-pink-400 to-purple-400', order: 3 },
  { id: 'animals', name: 'Animals', icon: '🦁', color: 'from-amber-500 to-yellow-500', order: 4 },
  { id: 'food', name: 'Food', icon: '🍕', color: 'from-yellow-500 to-orange-500', order: 5 },
  { id: 'celebration', name: 'Celebration', icon: '🎉', color: 'from-purple-500 to-pink-500', order: 6 },
  { id: 'luxury', name: 'Luxury', icon: '💎', color: 'from-cyan-500 to-blue-500', order: 7 },
  { id: 'vehicles', name: 'Vehicles', icon: '🚗', color: 'from-blue-500 to-indigo-500', order: 8 },
  { id: 'fantasy', name: 'Fantasy', icon: '🦄', color: 'from-violet-500 to-purple-500', order: 9 },
  { id: 'nature', name: 'Nature', icon: '🌈', color: 'from-green-500 to-teal-500', order: 10 },
  { id: 'space', name: 'Space', icon: '🚀', color: 'from-indigo-500 to-purple-600', order: 11 },
  { id: 'royal', name: 'Royal', icon: '👑', color: 'from-yellow-500 to-amber-600', order: 12 },
  { id: 'music', name: 'Music', icon: '🎵', color: 'from-fuchsia-500 to-pink-500', order: 13 },
  { id: 'sports', name: 'Sports', icon: '⚽', color: 'from-green-600 to-emerald-500', order: 14 },
  { id: 'legendary', name: 'Legendary', icon: '🐉', color: 'from-red-600 to-orange-500', order: 15 },
];

// 150 Premium Gifts (10 per category)
export const allGifts: GiftData[] = [
  // ========== POPULAR (10 gifts) ==========
  { id: 'pop_rose', name: 'Rose', emoji: '🌹', coins: 10, category: 'popular', animationType: 'basic' },
  { id: 'pop_heart', name: 'Heart', emoji: '❤️', coins: 20, category: 'popular', animationType: 'basic' },
  { id: 'pop_kiss', name: 'Kiss', emoji: '💋', coins: 30, category: 'popular', animationType: 'basic' },
  { id: 'pop_star', name: 'Star', emoji: '⭐', coins: 50, category: 'popular', animationType: 'basic' },
  { id: 'pop_fire', name: 'Fire', emoji: '🔥', coins: 40, category: 'popular', animationType: 'basic' },
  { id: 'pop_rainbow', name: 'Rainbow', emoji: '🌈', coins: 100, category: 'popular', animationType: 'premium' },
  { id: 'pop_diamond', name: 'Diamond', emoji: '💎', coins: 150, category: 'popular', animationType: 'premium' },
  { id: 'pop_crown', name: 'Crown', emoji: '👑', coins: 200, category: 'popular', animationType: 'premium' },
  { id: 'pop_rocket', name: 'Rocket', emoji: '🚀', coins: 500, category: 'popular', animationType: 'luxury' },
  { id: 'pop_castle', name: 'Castle', emoji: '🏰', coins: 1000, category: 'popular', animationType: 'legendary' },

  // ========== LOVE (10 gifts) ==========
  { id: 'love_red_heart', name: 'Red Heart', emoji: '❤️', coins: 15, category: 'love', animationType: 'basic' },
  { id: 'love_pink_heart', name: 'Pink Heart', emoji: '💗', coins: 25, category: 'love', animationType: 'basic' },
  { id: 'love_sparkling', name: 'Sparkling Heart', emoji: '💖', coins: 40, category: 'love', animationType: 'basic' },
  { id: 'love_growing', name: 'Growing Heart', emoji: '💓', coins: 60, category: 'love', animationType: 'premium' },
  { id: 'love_revolving', name: 'Revolving Hearts', emoji: '💞', coins: 80, category: 'love', animationType: 'premium' },
  { id: 'love_cupid', name: 'Cupid Arrow', emoji: '💘', coins: 150, category: 'love', animationType: 'premium' },
  { id: 'love_letter', name: 'Love Letter', emoji: '💌', coins: 100, category: 'love', animationType: 'premium' },
  { id: 'love_ring', name: 'Diamond Ring', emoji: '💍', coins: 500, category: 'love', animationType: 'luxury' },
  { id: 'love_wedding', name: 'Wedding', emoji: '💒', coins: 1000, category: 'love', animationType: 'luxury' },
  { id: 'love_eternal', name: 'Eternal Love', emoji: '💝', coins: 2000, category: 'love', animationType: 'legendary' },

  // ========== FLOWERS (10 gifts) ==========
  { id: 'flower_cherry', name: 'Cherry Blossom', emoji: '🌸', coins: 15, category: 'flowers', animationType: 'basic' },
  { id: 'flower_tulip', name: 'Tulip', emoji: '🌷', coins: 20, category: 'flowers', animationType: 'basic' },
  { id: 'flower_sunflower', name: 'Sunflower', emoji: '🌻', coins: 30, category: 'flowers', animationType: 'basic' },
  { id: 'flower_hibiscus', name: 'Hibiscus', emoji: '🌺', coins: 40, category: 'flowers', animationType: 'basic' },
  { id: 'flower_lotus', name: 'Lotus', emoji: '🪷', coins: 60, category: 'flowers', animationType: 'premium' },
  { id: 'flower_bouquet', name: 'Bouquet', emoji: '💐', coins: 100, category: 'flowers', animationType: 'premium' },
  { id: 'flower_garden', name: 'Flower Garden', emoji: '🌼', coins: 200, category: 'flowers', animationType: 'premium' },
  { id: 'flower_rose_gold', name: 'Rose Gold', emoji: '🌹', coins: 500, category: 'flowers', animationType: 'luxury' },
  { id: 'flower_paradise', name: 'Paradise Bloom', emoji: '🏵️', coins: 1000, category: 'flowers', animationType: 'luxury' },
  { id: 'flower_eternal', name: 'Eternal Rose', emoji: '🥀', coins: 2500, category: 'flowers', animationType: 'legendary' },

  // ========== ANIMALS (10 gifts) ==========
  { id: 'animal_cat', name: 'Cat', emoji: '🐱', coins: 20, category: 'animals', animationType: 'basic' },
  { id: 'animal_dog', name: 'Dog', emoji: '🐕', coins: 25, category: 'animals', animationType: 'basic' },
  { id: 'animal_bunny', name: 'Bunny', emoji: '🐰', coins: 30, category: 'animals', animationType: 'basic' },
  { id: 'animal_teddy', name: 'Teddy Bear', emoji: '🧸', coins: 50, category: 'animals', animationType: 'basic' },
  { id: 'animal_butterfly', name: 'Butterfly', emoji: '🦋', coins: 80, category: 'animals', animationType: 'premium' },
  { id: 'animal_dove', name: 'Dove', emoji: '🕊️', coins: 100, category: 'animals', animationType: 'premium' },
  { id: 'animal_swan', name: 'Swan', emoji: '🦢', coins: 200, category: 'animals', animationType: 'premium' },
  { id: 'animal_lion', name: 'Lion King', emoji: '🦁', coins: 500, category: 'animals', animationType: 'luxury' },
  { id: 'animal_elephant', name: 'Royal Elephant', emoji: '🐘', coins: 1000, category: 'animals', animationType: 'luxury' },
  { id: 'animal_peacock', name: 'Peacock Dance', emoji: '🦚', coins: 3000, category: 'animals', animationType: 'legendary' },

  // ========== FOOD (10 gifts) ==========
  { id: 'food_candy', name: 'Candy', emoji: '🍬', coins: 10, category: 'food', animationType: 'basic' },
  { id: 'food_icecream', name: 'Ice Cream', emoji: '🍦', coins: 20, category: 'food', animationType: 'basic' },
  { id: 'food_cake', name: 'Cake', emoji: '🎂', coins: 50, category: 'food', animationType: 'basic' },
  { id: 'food_chocolate', name: 'Chocolate', emoji: '🍫', coins: 40, category: 'food', animationType: 'basic' },
  { id: 'food_pizza', name: 'Pizza', emoji: '🍕', coins: 60, category: 'food', animationType: 'premium' },
  { id: 'food_wine', name: 'Wine', emoji: '🍷', coins: 100, category: 'food', animationType: 'premium' },
  { id: 'food_champagne', name: 'Champagne', emoji: '🍾', coins: 200, category: 'food', animationType: 'premium' },
  { id: 'food_feast', name: 'Royal Feast', emoji: '🍽️', coins: 500, category: 'food', animationType: 'luxury' },
  { id: 'food_caviar', name: 'Caviar', emoji: '🦪', coins: 1000, category: 'food', animationType: 'luxury' },
  { id: 'food_golden', name: 'Golden Feast', emoji: '🥇', coins: 5000, category: 'food', animationType: 'legendary' },

  // ========== CELEBRATION (10 gifts) ==========
  { id: 'celeb_confetti', name: 'Confetti', emoji: '🎊', coins: 30, category: 'celebration', animationType: 'basic' },
  { id: 'celeb_balloon', name: 'Balloon', emoji: '🎈', coins: 25, category: 'celebration', animationType: 'basic' },
  { id: 'celeb_party', name: 'Party', emoji: '🎉', coins: 50, category: 'celebration', animationType: 'basic' },
  { id: 'celeb_sparkler', name: 'Sparkler', emoji: '🎇', coins: 80, category: 'celebration', animationType: 'premium' },
  { id: 'celeb_fireworks', name: 'Fireworks', emoji: '🎆', coins: 150, category: 'celebration', animationType: 'premium' },
  { id: 'celeb_trophy', name: 'Trophy', emoji: '🏆', coins: 300, category: 'celebration', animationType: 'premium' },
  { id: 'celeb_medal', name: 'Gold Medal', emoji: '🥇', coins: 200, category: 'celebration', animationType: 'premium' },
  { id: 'celeb_disco', name: 'Disco Ball', emoji: '🪩', coins: 500, category: 'celebration', animationType: 'luxury' },
  { id: 'celeb_vip', name: 'VIP Party', emoji: '🎰', coins: 2000, category: 'celebration', animationType: 'luxury' },
  { id: 'celeb_grand', name: 'Grand Gala', emoji: '✨', coins: 10000, category: 'celebration', animationType: 'legendary' },

  // ========== LUXURY (10 gifts) ==========
  { id: 'lux_gem', name: 'Gem', emoji: '💠', coins: 100, category: 'luxury', animationType: 'premium' },
  { id: 'lux_diamond', name: 'Blue Diamond', emoji: '💎', coins: 200, category: 'luxury', animationType: 'premium' },
  { id: 'lux_money', name: 'Money Bag', emoji: '💰', coins: 500, category: 'luxury', animationType: 'luxury' },
  { id: 'lux_watch', name: 'Luxury Watch', emoji: '⌚', coins: 800, category: 'luxury', animationType: 'luxury' },
  { id: 'lux_handbag', name: 'Designer Bag', emoji: '👜', coins: 1000, category: 'luxury', animationType: 'luxury' },
  { id: 'lux_perfume', name: 'Perfume', emoji: '🧴', coins: 600, category: 'luxury', animationType: 'luxury' },
  { id: 'lux_heels', name: 'Designer Heels', emoji: '👠', coins: 700, category: 'luxury', animationType: 'luxury' },
  { id: 'lux_gold_bar', name: 'Gold Bar', emoji: '🥇', coins: 5000, category: 'luxury', animationType: 'legendary' },
  { id: 'lux_treasure', name: 'Treasure Chest', emoji: '💎', coins: 10000, category: 'luxury', animationType: 'legendary' },
  { id: 'lux_vault', name: 'Diamond Vault', emoji: '🏦', coins: 50000, category: 'luxury', animationType: 'legendary' },

  // ========== VEHICLES (10 gifts) ==========
  { id: 'veh_bicycle', name: 'Bicycle', emoji: '🚲', coins: 100, category: 'vehicles', animationType: 'basic' },
  { id: 'veh_motorcycle', name: 'Motorcycle', emoji: '🏍️', coins: 300, category: 'vehicles', animationType: 'premium' },
  { id: 'veh_car', name: 'Car', emoji: '🚗', coins: 500, category: 'vehicles', animationType: 'premium' },
  { id: 'veh_sports', name: 'Sports Car', emoji: '🏎️', coins: 2000, category: 'vehicles', animationType: 'luxury' },
  { id: 'veh_limo', name: 'Limousine', emoji: '🚙', coins: 3000, category: 'vehicles', animationType: 'luxury' },
  { id: 'veh_helicopter', name: 'Helicopter', emoji: '🚁', coins: 5000, category: 'vehicles', animationType: 'luxury' },
  { id: 'veh_yacht', name: 'Luxury Yacht', emoji: '🛥️', coins: 8000, category: 'vehicles', animationType: 'legendary' },
  { id: 'veh_jet', name: 'Private Jet', emoji: '✈️', coins: 15000, category: 'vehicles', animationType: 'legendary' },
  { id: 'veh_rocket', name: 'Space Rocket', emoji: '🚀', coins: 30000, category: 'vehicles', animationType: 'legendary' },
  { id: 'veh_ufo', name: 'UFO', emoji: '🛸', coins: 50000, category: 'vehicles', animationType: 'legendary' },

  // ========== FANTASY (10 gifts) ==========
  { id: 'fan_magic', name: 'Magic Wand', emoji: '🪄', coins: 80, category: 'fantasy', animationType: 'premium' },
  { id: 'fan_crystal', name: 'Crystal Ball', emoji: '🔮', coins: 150, category: 'fantasy', animationType: 'premium' },
  { id: 'fan_fairy', name: 'Fairy', emoji: '🧚', coins: 300, category: 'fantasy', animationType: 'premium' },
  { id: 'fan_mermaid', name: 'Mermaid', emoji: '🧜‍♀️', coins: 500, category: 'fantasy', animationType: 'luxury' },
  { id: 'fan_unicorn', name: 'Unicorn', emoji: '🦄', coins: 1000, category: 'fantasy', animationType: 'luxury' },
  { id: 'fan_angel', name: 'Angel', emoji: '👼', coins: 2000, category: 'fantasy', animationType: 'luxury' },
  { id: 'fan_genie', name: 'Genie', emoji: '🧞', coins: 3000, category: 'fantasy', animationType: 'legendary' },
  { id: 'fan_phoenix', name: 'Phoenix', emoji: '🔥', coins: 5000, category: 'fantasy', animationType: 'legendary' },
  { id: 'fan_dragon', name: 'Golden Dragon', emoji: '🐉', coins: 10000, category: 'fantasy', animationType: 'legendary' },
  { id: 'fan_realm', name: 'Fantasy Realm', emoji: '🌌', coins: 50000, category: 'fantasy', animationType: 'legendary' },

  // ========== NATURE (10 gifts) ==========
  { id: 'nat_sun', name: 'Sunshine', emoji: '☀️', coins: 30, category: 'nature', animationType: 'basic' },
  { id: 'nat_moon', name: 'Moonlight', emoji: '🌙', coins: 50, category: 'nature', animationType: 'basic' },
  { id: 'nat_rainbow', name: 'Rainbow', emoji: '🌈', coins: 100, category: 'nature', animationType: 'premium' },
  { id: 'nat_waterfall', name: 'Waterfall', emoji: '💦', coins: 200, category: 'nature', animationType: 'premium' },
  { id: 'nat_aurora', name: 'Aurora', emoji: '🌌', coins: 500, category: 'nature', animationType: 'luxury' },
  { id: 'nat_volcano', name: 'Volcano', emoji: '🌋', coins: 1000, category: 'nature', animationType: 'luxury' },
  { id: 'nat_ocean', name: 'Ocean Wave', emoji: '🌊', coins: 800, category: 'nature', animationType: 'luxury' },
  { id: 'nat_thunder', name: 'Thunder Storm', emoji: '⛈️', coins: 1500, category: 'nature', animationType: 'legendary' },
  { id: 'nat_eclipse', name: 'Solar Eclipse', emoji: '🌑', coins: 5000, category: 'nature', animationType: 'legendary' },
  { id: 'nat_galaxy', name: 'Galaxy', emoji: '🌌', coins: 20000, category: 'nature', animationType: 'legendary' },

  // ========== SPACE (10 gifts) ==========
  { id: 'space_star', name: 'Shooting Star', emoji: '🌠', coins: 50, category: 'space', animationType: 'basic' },
  { id: 'space_comet', name: 'Comet', emoji: '☄️', coins: 100, category: 'space', animationType: 'premium' },
  { id: 'space_moon', name: 'Full Moon', emoji: '🌕', coins: 150, category: 'space', animationType: 'premium' },
  { id: 'space_planet', name: 'Planet', emoji: '🪐', coins: 300, category: 'space', animationType: 'premium' },
  { id: 'space_rocket', name: 'Rocket', emoji: '🚀', coins: 500, category: 'space', animationType: 'luxury' },
  { id: 'space_satellite', name: 'Satellite', emoji: '🛰️', coins: 800, category: 'space', animationType: 'luxury' },
  { id: 'space_ufo', name: 'UFO', emoji: '🛸', coins: 2000, category: 'space', animationType: 'luxury' },
  { id: 'space_nebula', name: 'Nebula', emoji: '🌌', coins: 5000, category: 'space', animationType: 'legendary' },
  { id: 'space_blackhole', name: 'Black Hole', emoji: '🕳️', coins: 15000, category: 'space', animationType: 'legendary' },
  { id: 'space_universe', name: 'Universe', emoji: '✨', coins: 99999, category: 'space', animationType: 'legendary' },

  // ========== ROYAL (10 gifts) ==========
  { id: 'royal_crown', name: 'Crown', emoji: '👑', coins: 200, category: 'royal', animationType: 'premium' },
  { id: 'royal_throne', name: 'Throne', emoji: '🪑', coins: 500, category: 'royal', animationType: 'luxury' },
  { id: 'royal_scepter', name: 'Scepter', emoji: '🔱', coins: 800, category: 'royal', animationType: 'luxury' },
  { id: 'royal_carriage', name: 'Royal Carriage', emoji: '🚃', coins: 1500, category: 'royal', animationType: 'luxury' },
  { id: 'royal_guard', name: 'Royal Guard', emoji: '💂', coins: 1000, category: 'royal', animationType: 'luxury' },
  { id: 'royal_palace', name: 'Palace', emoji: '🏛️', coins: 5000, category: 'royal', animationType: 'legendary' },
  { id: 'royal_castle', name: 'Castle', emoji: '🏰', coins: 10000, category: 'royal', animationType: 'legendary' },
  { id: 'royal_kingdom', name: 'Kingdom', emoji: '⚔️', coins: 25000, category: 'royal', animationType: 'legendary' },
  { id: 'royal_empire', name: 'Empire', emoji: '🗡️', coins: 50000, category: 'royal', animationType: 'legendary' },
  { id: 'royal_dynasty', name: 'Dynasty', emoji: '🦅', coins: 99999, category: 'royal', animationType: 'legendary' },

  // ========== MUSIC (10 gifts) ==========
  { id: 'music_note', name: 'Music Note', emoji: '🎵', coins: 30, category: 'music', animationType: 'basic' },
  { id: 'music_headphone', name: 'Headphones', emoji: '🎧', coins: 80, category: 'music', animationType: 'premium' },
  { id: 'music_mic', name: 'Microphone', emoji: '🎤', coins: 150, category: 'music', animationType: 'premium' },
  { id: 'music_guitar', name: 'Guitar', emoji: '🎸', coins: 300, category: 'music', animationType: 'premium' },
  { id: 'music_piano', name: 'Piano', emoji: '🎹', coins: 500, category: 'music', animationType: 'luxury' },
  { id: 'music_violin', name: 'Violin', emoji: '🎻', coins: 800, category: 'music', animationType: 'luxury' },
  { id: 'music_drum', name: 'Drums', emoji: '🥁', coins: 400, category: 'music', animationType: 'luxury' },
  { id: 'music_concert', name: 'Concert', emoji: '🎪', coins: 2000, category: 'music', animationType: 'legendary' },
  { id: 'music_orchestra', name: 'Orchestra', emoji: '🎼', coins: 5000, category: 'music', animationType: 'legendary' },
  { id: 'music_grammy', name: 'Grammy Award', emoji: '🏆', coins: 20000, category: 'music', animationType: 'legendary' },

  // ========== SPORTS (10 gifts) ==========
  { id: 'sport_football', name: 'Football', emoji: '⚽', coins: 50, category: 'sports', animationType: 'basic' },
  { id: 'sport_basketball', name: 'Basketball', emoji: '🏀', coins: 60, category: 'sports', animationType: 'basic' },
  { id: 'sport_cricket', name: 'Cricket', emoji: '🏏', coins: 80, category: 'sports', animationType: 'premium' },
  { id: 'sport_tennis', name: 'Tennis', emoji: '🎾', coins: 100, category: 'sports', animationType: 'premium' },
  { id: 'sport_boxing', name: 'Boxing', emoji: '🥊', coins: 200, category: 'sports', animationType: 'premium' },
  { id: 'sport_medal', name: 'Gold Medal', emoji: '🥇', coins: 500, category: 'sports', animationType: 'luxury' },
  { id: 'sport_trophy', name: 'World Cup', emoji: '🏆', coins: 1000, category: 'sports', animationType: 'luxury' },
  { id: 'sport_olympics', name: 'Olympics', emoji: '🏅', coins: 2000, category: 'sports', animationType: 'legendary' },
  { id: 'sport_champion', name: 'Champion', emoji: '🎖️', coins: 5000, category: 'sports', animationType: 'legendary' },
  { id: 'sport_legend', name: 'Sports Legend', emoji: '⭐', coins: 15000, category: 'sports', animationType: 'legendary' },

  // ========== LEGENDARY (10 gifts) ==========
  { id: 'leg_dragon', name: 'Fire Dragon', emoji: '🐉', coins: 5000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_phoenix', name: 'Golden Phoenix', emoji: '🔥', coins: 8000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_titan', name: 'Titan', emoji: '👹', coins: 10000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_god', name: 'God of War', emoji: '⚔️', coins: 15000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_thunder', name: 'Thunder God', emoji: '⚡', coins: 20000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_emperor', name: 'Emperor', emoji: '👑', coins: 30000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_cosmos', name: 'Cosmic Force', emoji: '🌌', coins: 50000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_eternal', name: 'Eternal Flame', emoji: '🔱', coins: 75000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_supreme', name: 'Supreme Being', emoji: '✨', coins: 100000, category: 'legendary', animationType: 'legendary' },
  { id: 'leg_infinity', name: 'Infinity', emoji: '♾️', coins: 999999, category: 'legendary', animationType: 'legendary' },
];

// Helper functions
export const getGiftsByCategory = (categoryId: string): GiftData[] => {
  return allGifts.filter(g => g.category === categoryId);
};

export const getGiftById = (id: string): GiftData | undefined => {
  return allGifts.find(g => g.id === id);
};

export const getCategoryById = (id: string): GiftCategory | undefined => {
  return giftCategories.find(c => c.id === id);
};

export const formatCoinValue = (coins: number): string => {
  if (coins >= 1000000) return `${(coins / 1000000).toFixed(1)}M`;
  if (coins >= 1000) return `${(coins / 1000).toFixed(coins >= 10000 ? 0 : 1)}K`;
  return coins.toString();
};
