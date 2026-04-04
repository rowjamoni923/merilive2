// Default Luxury Gift Animation Library
// Pre-made animations that can be selected from the admin panel

export interface DefaultAnimation {
  id: string;
  name: string;
  nameBn: string;
  category: 'luxury' | 'love' | 'party' | 'royal' | 'nature' | 'fantasy' | 'vehicles' | 'gems';
  tier: 'premium' | 'luxury' | 'legendary';
  previewEmoji: string;
  previewColor: string;
  animationData: object; // Lottie JSON
}

// Create Lottie animation helper
const createGiftLottie = (
  name: string,
  colors: { primary: string; secondary: string; tertiary: string },
  effect: 'pulse' | 'rotate' | 'sparkle' | 'burst' | 'float' | 'glow' | 'wave',
  shape: 'heart' | 'star' | 'diamond' | 'crown' | 'flame' | 'flower' | 'ring' | 'rocket' | 'car' | 'plane'
): object => {
  const hexToRgb = (hex: string): number[] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ] : [1, 0.84, 0];
  };

  const shapeData: Record<string, object> = {
    heart: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -25], [25, 5], [0, 35], [-25, 5]], i: [[12, 0], [0, 15], [-12, 0], [0, -15]], o: [[-12, 0], [0, 15], [12, 0], [0, -15]] } } },
    star: { ty: "sr", pt: { a: 0, k: 5 }, sy: 1, or: { a: 0, k: 45 }, ir: { a: 0, k: 22 } },
    diamond: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -35], [30, 0], [0, 45], [-30, 0]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] } } },
    crown: { ty: "sh", ks: { a: 0, k: { c: true, v: [[-35, 18], [-25, -18], [-12, 0], [0, -25], [12, 0], [25, -18], [35, 18]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    flame: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -45], [18, -18], [12, 8], [0, 28], [-12, 8], [-18, -18]], i: [[8, 0], [4, 12], [4, 8], [0, 0], [-4, 8], [-4, 12]], o: [[-8, 0], [-4, 12], [-4, 8], [0, 0], [4, 8], [4, 12]] } } },
    flower: { ty: "sr", pt: { a: 0, k: 6 }, sy: 2, or: { a: 0, k: 40 }, ir: { a: 0, k: 20 } },
    ring: { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [70, 70] } },
    rocket: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -40], [15, 0], [10, 20], [-10, 20], [-15, 0]], i: [[0, 0], [5, -15], [0, 0], [0, 0], [-5, -15]], o: [[0, 0], [-5, 15], [0, 0], [0, 0], [5, 15]] } } },
    car: { ty: "sh", ks: { a: 0, k: { c: true, v: [[-30, 5], [-25, -10], [-10, -15], [15, -15], [30, -5], [30, 10], [-30, 10]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    plane: { ty: "sh", ks: { a: 0, k: { c: true, v: [[40, 0], [0, -10], [-30, -5], [-40, 0], [-30, 5], [0, 10]], i: [[0, 0], [10, 0], [0, 0], [0, 0], [0, 0], [-10, 0]], o: [[0, 0], [-10, 0], [0, 0], [0, 0], [0, 0], [10, 0]] } } }
  };

  const effectKeyframes: Record<string, { rotation: object; scale: object; opacity: object }> = {
    pulse: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 30, s: [120, 120, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 90, s: [120, 120, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 0, k: 100 }
    },
    rotate: {
      rotation: { a: 1, k: [{ t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } }, { t: 120, s: [360] }] },
      scale: { a: 0, k: [100, 100, 100] },
      opacity: { a: 0, k: 100 }
    },
    sparkle: {
      rotation: { a: 1, k: [{ t: 0, s: [0] }, { t: 60, s: [180] }, { t: 120, s: [360] }] },
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100] }, { t: 30, s: [130, 130, 100] },
        { t: 60, s: [100, 100, 100] }, { t: 90, s: [130, 130, 100] }, { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 1, k: [{ t: 0, s: [100] }, { t: 30, s: [60] }, { t: 60, s: [100] }, { t: 90, s: [60] }, { t: 120, s: [100] }] }
    },
    burst: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [0, 0, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [140, 140, 100] }, { t: 40, s: [100, 100, 100] }, { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 1, k: [{ t: 0, s: [0] }, { t: 20, s: [100] }, { t: 120, s: [100] }] }
    },
    float: {
      rotation: { a: 1, k: [{ t: 0, s: [-5] }, { t: 60, s: [5] }, { t: 120, s: [-5] }] },
      scale: { a: 0, k: [100, 100, 100] },
      opacity: { a: 1, k: [{ t: 0, s: [80] }, { t: 60, s: [100] }, { t: 120, s: [80] }] }
    },
    glow: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [{ t: 0, s: [100, 100, 100] }, { t: 60, s: [110, 110, 100] }, { t: 120, s: [100, 100, 100] }] },
      opacity: { a: 1, k: [{ t: 0, s: [70] }, { t: 60, s: [100] }, { t: 120, s: [70] }] }
    },
    wave: {
      rotation: { a: 1, k: [{ t: 0, s: [-10] }, { t: 30, s: [10] }, { t: 60, s: [-10] }, { t: 90, s: [10] }, { t: 120, s: [-10] }] },
      scale: { a: 0, k: [100, 100, 100] },
      opacity: { a: 0, k: 100 }
    }
  };

  const primary = hexToRgb(colors.primary);
  const secondary = hexToRgb(colors.secondary);
  const tertiary = hexToRgb(colors.tertiary);
  const effects = effectKeyframes[effect];

  return {
    v: "5.7.4",
    fr: 60,
    ip: 0,
    op: 120,
    w: 200,
    h: 200,
    nm: name,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0, ind: 1, ty: 4, nm: "Main", sr: 1,
        ks: { o: effects.opacity, r: effects.rotation, p: { a: 0, k: [100, 100, 0] }, a: { a: 0, k: [0, 0, 0] }, s: effects.scale },
        ao: 0,
        shapes: [{
          ty: "gr",
          it: [
            shapeData[shape],
            { ty: "gf", o: { a: 0, k: 100 }, r: 1, bm: 0, g: { p: 3, k: { a: 0, k: [0, ...primary, 0.5, ...secondary, 1, ...tertiary] } }, s: { a: 0, k: [0, -45] }, e: { a: 0, k: [0, 45] }, t: 1 },
            { ty: "st", c: { a: 0, k: secondary }, o: { a: 0, k: 100 }, w: { a: 0, k: 2 } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ],
          nm: "Shape"
        }],
        ip: 0, op: 120, st: 0
      },
      {
        ddd: 0, ind: 2, ty: 4, nm: "Glow", sr: 1,
        ks: {
          o: { a: 1, k: [{ t: 0, s: [30] }, { t: 60, s: [60] }, { t: 120, s: [30] }] },
          r: { a: 0, k: 0 },
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 1, k: [{ t: 0, s: [150, 150, 100] }, { t: 60, s: [170, 170, 100] }, { t: 120, s: [150, 150, 100] }] }
        },
        ao: 0,
        shapes: [{
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 80] } },
            { ty: "gf", o: { a: 0, k: 50 }, r: 1, bm: 0, g: { p: 2, k: { a: 0, k: [0, ...primary, 1, 0, 0, 0] } }, s: { a: 0, k: [0, 0] }, e: { a: 0, k: [40, 40] }, t: 2 },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ],
          nm: "Glow"
        }],
        ip: 0, op: 120, st: 0
      },
      {
        ddd: 0, ind: 3, ty: 4, nm: "Particles", sr: 1,
        ks: {
          o: { a: 1, k: [{ t: 0, s: [0] }, { t: 15, s: [100] }, { t: 105, s: [100] }, { t: 120, s: [0] }] },
          r: { a: 1, k: [{ t: 0, s: [0] }, { t: 120, s: [-360] }] },
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] }
        },
        ao: 0,
        shapes: [
          { ty: "gr", it: [{ ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 6 }, ir: { a: 0, k: 2 } }, { ty: "fl", c: { a: 0, k: primary }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [55, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }], nm: "P1" },
          { ty: "gr", it: [{ ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 5 }, ir: { a: 0, k: 2 } }, { ty: "fl", c: { a: 0, k: secondary }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [-50, 25] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 80] }, r: { a: 0, k: 45 }, o: { a: 0, k: 100 } }], nm: "P2" },
          { ty: "gr", it: [{ ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 4 }, ir: { a: 0, k: 1 } }, { ty: "fl", c: { a: 0, k: tertiary }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [30, -48] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [60, 60] }, r: { a: 0, k: 22 }, o: { a: 0, k: 100 } }], nm: "P3" },
          { ty: "gr", it: [{ ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 5 }, ir: { a: 0, k: 2 } }, { ty: "fl", c: { a: 0, k: primary }, o: { a: 0, k: 100 } }, { ty: "tr", p: { a: 0, k: [-35, -40] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [70, 70] }, r: { a: 0, k: -30 }, o: { a: 0, k: 100 } }], nm: "P4" }
        ],
        ip: 0, op: 120, st: 0
      }
    ]
  };
};

// ===================== DEFAULT LUXURY ANIMATIONS - 30 ITEMS =====================
export const defaultGiftAnimations: DefaultAnimation[] = [
  // ========== LOVE CATEGORY (5) ==========
  {
    id: 'def_love_heart_burst',
    name: 'Love Heart Burst',
    nameBn: 'Love Heart Burst',
    category: 'love',
    tier: 'premium',
    previewEmoji: '💖',
    previewColor: '#FF69B4',
    animationData: createGiftLottie('Heart Burst', { primary: '#FF69B4', secondary: '#FF1493', tertiary: '#FFB6C1' }, 'burst', 'heart')
  },
  {
    id: 'def_love_floating_hearts',
    name: 'Floating Hearts',
    nameBn: 'Floating Hearts',
    category: 'love',
    tier: 'premium',
    previewEmoji: '💗',
    previewColor: '#FF1493',
    animationData: createGiftLottie('Floating Hearts', { primary: '#FF1493', secondary: '#FF69B4', tertiary: '#FFC0CB' }, 'float', 'heart')
  },
  {
    id: 'def_love_pulsing_heart',
    name: 'Pulsing Heart',
    nameBn: 'Pulsing Heart',
    category: 'love',
    tier: 'luxury',
    previewEmoji: '❤️',
    previewColor: '#DC143C',
    animationData: createGiftLottie('Pulsing Heart', { primary: '#DC143C', secondary: '#FF4500', tertiary: '#FF6B6B' }, 'pulse', 'heart')
  },
  {
    id: 'def_love_sparkling_heart',
    name: 'Sparkling Heart',
    nameBn: 'Sparkling Heart',
    category: 'love',
    tier: 'legendary',
    previewEmoji: '💝',
    previewColor: '#FF007F',
    animationData: createGiftLottie('Sparkling Heart', { primary: '#FF007F', secondary: '#FF69B4', tertiary: '#FFD700' }, 'sparkle', 'heart')
  },
  {
    id: 'def_love_eternal',
    name: 'Eternal Love',
    nameBn: 'Eternal Love',
    category: 'love',
    tier: 'legendary',
    previewEmoji: '💞',
    previewColor: '#E91E63',
    animationData: createGiftLottie('Eternal Love', { primary: '#E91E63', secondary: '#9C27B0', tertiary: '#FFD700' }, 'glow', 'heart')
  },

  // ========== LUXURY/GEMS CATEGORY (5) ==========
  {
    id: 'def_gem_diamond_sparkle',
    name: 'Diamond Sparkle',
    nameBn: 'Diamond Sparkle',
    category: 'gems',
    tier: 'luxury',
    previewEmoji: '💎',
    previewColor: '#00CED1',
    animationData: createGiftLottie('Diamond Sparkle', { primary: '#00CED1', secondary: '#40E0D0', tertiary: '#AFEEEE' }, 'sparkle', 'diamond')
  },
  {
    id: 'def_gem_ruby_glow',
    name: 'Ruby Glow',
    nameBn: 'Ruby Glow',
    category: 'gems',
    tier: 'luxury',
    previewEmoji: '💠',
    previewColor: '#E0115F',
    animationData: createGiftLottie('Ruby Glow', { primary: '#E0115F', secondary: '#DC143C', tertiary: '#FF6B6B' }, 'glow', 'diamond')
  },
  {
    id: 'def_gem_emerald_burst',
    name: 'Emerald Burst',
    nameBn: 'Emerald Burst',
    category: 'gems',
    tier: 'legendary',
    previewEmoji: '💚',
    previewColor: '#50C878',
    animationData: createGiftLottie('Emerald Burst', { primary: '#50C878', secondary: '#228B22', tertiary: '#90EE90' }, 'burst', 'diamond')
  },
  {
    id: 'def_gem_sapphire',
    name: 'Sapphire Shine',
    nameBn: 'Sapphire Shine',
    category: 'gems',
    tier: 'legendary',
    previewEmoji: '💙',
    previewColor: '#0F52BA',
    animationData: createGiftLottie('Sapphire Shine', { primary: '#0F52BA', secondary: '#4169E1', tertiary: '#87CEEB' }, 'pulse', 'diamond')
  },
  {
    id: 'def_gem_gold_treasure',
    name: 'Gold Treasure',
    nameBn: 'Gold Treasure',
    category: 'gems',
    tier: 'legendary',
    previewEmoji: '🏆',
    previewColor: '#FFD700',
    animationData: createGiftLottie('Gold Treasure', { primary: '#FFD700', secondary: '#FFA500', tertiary: '#FFEC8B' }, 'rotate', 'diamond')
  },

  // ========== ROYAL CATEGORY (5) ==========
  {
    id: 'def_royal_golden_crown',
    name: 'Golden Crown',
    nameBn: 'Golden Crown',
    category: 'royal',
    tier: 'luxury',
    previewEmoji: '👑',
    previewColor: '#FFD700',
    animationData: createGiftLottie('Golden Crown', { primary: '#FFD700', secondary: '#FFA500', tertiary: '#FFEC8B' }, 'pulse', 'crown')
  },
  {
    id: 'def_royal_platinum_crown',
    name: 'Platinum Crown',
    nameBn: 'Platinum Crown',
    category: 'royal',
    tier: 'legendary',
    previewEmoji: '👸',
    previewColor: '#E5E4E2',
    animationData: createGiftLottie('Platinum Crown', { primary: '#E5E4E2', secondary: '#B0C4DE', tertiary: '#87CEEB' }, 'sparkle', 'crown')
  },
  {
    id: 'def_royal_emperor',
    name: 'Emperor Crown',
    nameBn: 'Emperor Crown',
    category: 'royal',
    tier: 'legendary',
    previewEmoji: '🤴',
    previewColor: '#9400D3',
    animationData: createGiftLottie('Emperor Crown', { primary: '#9400D3', secondary: '#FFD700', tertiary: '#8A2BE2' }, 'glow', 'crown')
  },
  {
    id: 'def_royal_diamond_ring',
    name: 'Diamond Ring',
    nameBn: 'Diamond Ring',
    category: 'royal',
    tier: 'luxury',
    previewEmoji: '💍',
    previewColor: '#B9F2FF',
    animationData: createGiftLottie('Diamond Ring', { primary: '#B9F2FF', secondary: '#00CED1', tertiary: '#FFFFFF' }, 'rotate', 'ring')
  },
  {
    id: 'def_royal_scepter',
    name: 'Royal Scepter',
    nameBn: 'Royal Scepter',
    category: 'royal',
    tier: 'legendary',
    previewEmoji: '⚜️',
    previewColor: '#DAA520',
    animationData: createGiftLottie('Royal Scepter', { primary: '#DAA520', secondary: '#FFD700', tertiary: '#FFA500' }, 'wave', 'star')
  },

  // ========== PARTY CATEGORY (5) ==========
  {
    id: 'def_party_confetti',
    name: 'Confetti Burst',
    nameBn: 'Confetti Burst',
    category: 'party',
    tier: 'premium',
    previewEmoji: '🎊',
    previewColor: '#FF6B6B',
    animationData: createGiftLottie('Confetti', { primary: '#FF6B6B', secondary: '#4ECDC4', tertiary: '#FFE66D' }, 'burst', 'star')
  },
  {
    id: 'def_party_fireworks',
    name: 'Fireworks',
    nameBn: 'Fireworks',
    category: 'party',
    tier: 'luxury',
    previewEmoji: '🎆',
    previewColor: '#9400D3',
    animationData: createGiftLottie('Fireworks', { primary: '#9400D3', secondary: '#FF1493', tertiary: '#00CED1' }, 'burst', 'star')
  },
  {
    id: 'def_party_disco',
    name: 'Disco Ball',
    nameBn: 'Disco Ball',
    category: 'party',
    tier: 'luxury',
    previewEmoji: '🪩',
    previewColor: '#C0C0C0',
    animationData: createGiftLottie('Disco Ball', { primary: '#C0C0C0', secondary: '#FFD700', tertiary: '#FF69B4' }, 'rotate', 'ring')
  },
  {
    id: 'def_party_vip',
    name: 'VIP Party',
    nameBn: 'VIP Party',
    category: 'party',
    tier: 'legendary',
    previewEmoji: '🎉',
    previewColor: '#FFD700',
    animationData: createGiftLottie('VIP Party', { primary: '#FFD700', secondary: '#9400D3', tertiary: '#FF1493' }, 'sparkle', 'star')
  },
  {
    id: 'def_party_champagne',
    name: 'Champagne Pop',
    nameBn: 'Champagne Pop',
    category: 'party',
    tier: 'legendary',
    previewEmoji: '🍾',
    previewColor: '#DAA520',
    animationData: createGiftLottie('Champagne', { primary: '#DAA520', secondary: '#FFD700', tertiary: '#FFFAF0' }, 'burst', 'flame')
  },

  // ========== FANTASY CATEGORY (5) ==========
  {
    id: 'def_fantasy_phoenix',
    name: 'Phoenix Fire',
    nameBn: 'Phoenix Fire',
    category: 'fantasy',
    tier: 'legendary',
    previewEmoji: '🔥',
    previewColor: '#FF4500',
    animationData: createGiftLottie('Phoenix', { primary: '#FF4500', secondary: '#FF6347', tertiary: '#FFD700' }, 'wave', 'flame')
  },
  {
    id: 'def_fantasy_dragon',
    name: 'Golden Dragon',
    nameBn: 'Golden Dragon',
    category: 'fantasy',
    tier: 'legendary',
    previewEmoji: '🐉',
    previewColor: '#228B22',
    animationData: createGiftLottie('Dragon', { primary: '#228B22', secondary: '#FFD700', tertiary: '#32CD32' }, 'pulse', 'flame')
  },
  {
    id: 'def_fantasy_unicorn',
    name: 'Magical Unicorn',
    nameBn: 'Magical Unicorn',
    category: 'fantasy',
    tier: 'luxury',
    previewEmoji: '🦄',
    previewColor: '#FF69B4',
    animationData: createGiftLottie('Unicorn', { primary: '#FF69B4', secondary: '#9400D3', tertiary: '#FFFFFF' }, 'float', 'star')
  },
  {
    id: 'def_fantasy_fairy',
    name: 'Fairy Dust',
    nameBn: 'Fairy Dust',
    category: 'fantasy',
    tier: 'luxury',
    previewEmoji: '🧚',
    previewColor: '#DDA0DD',
    animationData: createGiftLottie('Fairy', { primary: '#DDA0DD', secondary: '#BA55D3', tertiary: '#FFD700' }, 'sparkle', 'flower')
  },
  {
    id: 'def_fantasy_crystal',
    name: 'Crystal Magic',
    nameBn: 'Crystal Magic',
    category: 'fantasy',
    tier: 'premium',
    previewEmoji: '🔮',
    previewColor: '#8A2BE2',
    animationData: createGiftLottie('Crystal', { primary: '#8A2BE2', secondary: '#9400D3', tertiary: '#E6E6FA' }, 'glow', 'diamond')
  },

  // ========== VEHICLES CATEGORY (5) ==========
  {
    id: 'def_vehicle_sports_car',
    name: 'Sports Car',
    nameBn: 'Sports Car',
    category: 'vehicles',
    tier: 'luxury',
    previewEmoji: '🏎️',
    previewColor: '#DC143C',
    animationData: createGiftLottie('Sports Car', { primary: '#DC143C', secondary: '#B22222', tertiary: '#FFD700' }, 'pulse', 'car')
  },
  {
    id: 'def_vehicle_rocket',
    name: 'Space Rocket',
    nameBn: 'Space Rocket',
    category: 'vehicles',
    tier: 'legendary',
    previewEmoji: '🚀',
    previewColor: '#FF4500',
    animationData: createGiftLottie('Rocket', { primary: '#FF4500', secondary: '#FFD700', tertiary: '#87CEEB' }, 'float', 'rocket')
  },
  {
    id: 'def_vehicle_yacht',
    name: 'Luxury Yacht',
    nameBn: 'Luxury Yacht',
    category: 'vehicles',
    tier: 'legendary',
    previewEmoji: '🛥️',
    previewColor: '#1E90FF',
    animationData: createGiftLottie('Yacht', { primary: '#1E90FF', secondary: '#FFFFFF', tertiary: '#FFD700' }, 'wave', 'car')
  },
  {
    id: 'def_vehicle_jet',
    name: 'Private Jet',
    nameBn: 'Private Jet',
    category: 'vehicles',
    tier: 'legendary',
    previewEmoji: '✈️',
    previewColor: '#4169E1',
    animationData: createGiftLottie('Jet', { primary: '#4169E1', secondary: '#FFFFFF', tertiary: '#FFD700' }, 'float', 'plane')
  },
  {
    id: 'def_vehicle_helicopter',
    name: 'Helicopter',
    nameBn: 'Helicopter',
    category: 'vehicles',
    tier: 'luxury',
    previewEmoji: '🚁',
    previewColor: '#2F4F4F',
    animationData: createGiftLottie('Helicopter', { primary: '#2F4F4F', secondary: '#696969', tertiary: '#FFD700' }, 'rotate', 'plane')
  }
];

// Get animations by category
export const getAnimationsByCategory = (category: string): DefaultAnimation[] => {
  return defaultGiftAnimations.filter(a => a.category === category);
};

// Get animations by tier
export const getAnimationsByTier = (tier: 'premium' | 'luxury' | 'legendary'): DefaultAnimation[] => {
  return defaultGiftAnimations.filter(a => a.tier === tier);
};

// Animation categories for filter
export const animationCategories = [
  { id: 'all', name: 'All', nameBn: 'All' },
  { id: 'love', name: 'Love', nameBn: 'Love' },
  { id: 'gems', name: 'Gems', nameBn: 'Gems' },
  { id: 'royal', name: 'Royal', nameBn: 'Royal' },
  { id: 'party', name: 'Party', nameBn: 'Party' },
  { id: 'fantasy', name: 'Fantasy', nameBn: 'Fantasy' },
  { id: 'vehicles', name: 'Vehicles', nameBn: 'Vehicles' }
];
