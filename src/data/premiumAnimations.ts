// Premium Lottie Animation Data Store
// Contains 100 luxury animations for level privileges

export interface PremiumAnimation {
  id: string;
  name: string;
  description?: string;
  category: 'entry_bar' | 'portrait_frame' | 'privilege_sticker' | 'privilege_gift' | 'entrance_effect' | 'party_background' | 'badge' | 'special_effect';
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legendary';
  unlockLevel: number;
  previewColor: string;
  animationData: object;
}

// Advanced Lottie Animation Creator with multiple effects
const createAdvancedLottieAnimation = (
  name: string,
  primaryColor: string,
  secondaryColor: string,
  tertiaryColor: string,
  effectType: 'pulse' | 'rotate' | 'bounce' | 'glow' | 'sparkle' | 'wave' | 'explosion' | 'spiral' | 'float' | 'shimmer',
  shape: 'star' | 'heart' | 'crown' | 'diamond' | 'flame' | 'sparkle' | 'ring' | 'wings' | 'shield' | 'lightning' | 'flower' | 'hexagon' | 'triangle'
): object => {
  const hexToRgb = (hex: string): number[] => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? [
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ] : [1, 0.84, 0];
  };

  const shapeDefinitions: Record<string, object> = {
    star: { ty: "sr", pt: { a: 0, k: 5 }, sy: 1, or: { a: 0, k: 45 }, ir: { a: 0, k: 22 } },
    heart: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -25], [25, 5], [0, 35], [-25, 5]], i: [[12, 0], [0, 15], [-12, 0], [0, -15]], o: [[-12, 0], [0, 15], [12, 0], [0, -15]] } } },
    crown: { ty: "sh", ks: { a: 0, k: { c: true, v: [[-35, 18], [-25, -18], [-12, 0], [0, -25], [12, 0], [25, -18], [35, 18]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    diamond: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -35], [30, 0], [0, 45], [-30, 0]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] } } },
    flame: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -45], [18, -18], [12, 8], [0, 28], [-12, 8], [-18, -18]], i: [[8, 0], [4, 12], [4, 8], [0, 0], [-4, 8], [-4, 12]], o: [[-8, 0], [-4, 12], [-4, 8], [0, 0], [4, 8], [4, 12]] } } },
    sparkle: { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 38 }, ir: { a: 0, k: 8 } },
    ring: { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [70, 70] } },
    wings: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, 0], [35, -18], [55, 8], [35, 28], [0, 8]], i: [[0, 0], [8, 8], [0, 12], [-8, 8], [0, 0]], o: [[0, 0], [-8, -8], [0, -12], [8, -8], [0, 0]] } } },
    shield: { ty: "sh", ks: { a: 0, k: { c: true, v: [[-32, -32], [32, -32], [32, 8], [0, 42], [-32, 8]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    lightning: { ty: "sh", ks: { a: 0, k: { c: true, v: [[8, -45], [-2, -8], [18, -8], [-8, 45], [2, 8], [-18, 8]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    flower: { ty: "sr", pt: { a: 0, k: 6 }, sy: 2, or: { a: 0, k: 40 }, ir: { a: 0, k: 20 } },
    hexagon: { ty: "sr", pt: { a: 0, k: 6 }, sy: 1, or: { a: 0, k: 35 }, ir: { a: 0, k: 35 } },
    triangle: { ty: "sr", pt: { a: 0, k: 3 }, sy: 1, or: { a: 0, k: 40 }, ir: { a: 0, k: 40 } }
  };

  const effectKeyframes: Record<string, { rotation: object; scale: object; opacity: object }> = {
    pulse: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 30, s: [115, 115, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 90, s: [115, 115, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 0, k: 100 }
    },
    rotate: {
      rotation: { a: 1, k: [
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [360] }
      ]},
      scale: { a: 0, k: [100, 100, 100] },
      opacity: { a: 0, k: 100 }
    },
    bounce: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [110, 90, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [90, 115, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [105, 95, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [97, 102, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 100, s: [100, 100, 100] }
      ]},
      opacity: { a: 0, k: 100 }
    },
    glow: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [105, 105, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 1, k: [
        { t: 0, s: [70], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [70] }
      ]}
    },
    sparkle: {
      rotation: { a: 1, k: [
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [180], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [360] }
      ]},
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 30, s: [120, 120, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 90, s: [120, 120, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 1, k: [
        { t: 0, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 30, s: [60], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 90, s: [60], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100] }
      ]}
    },
    wave: {
      rotation: { a: 1, k: [
        { t: 0, s: [-8], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 30, s: [8], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [-8], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 90, s: [8], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [-8] }
      ]},
      scale: { a: 0, k: [100, 100, 100] },
      opacity: { a: 0, k: 100 }
    },
    explosion: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [0, 0, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [130, 130, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 1, k: [
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100] }
      ]}
    },
    spiral: {
      rotation: { a: 1, k: [
        { t: 0, s: [0], i: { x: [0.2], y: [1] }, o: { x: [0.8], y: [0] } },
        { t: 120, s: [720] }
      ]},
      scale: { a: 1, k: [
        { t: 0, s: [50, 50, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [110, 110, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 0, k: 100 }
    },
    float: {
      rotation: { a: 1, k: [
        { t: 0, s: [-3], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [3], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [-3] }
      ]},
      scale: { a: 0, k: [100, 100, 100] },
      opacity: { a: 1, k: [
        { t: 0, s: [80], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [80] }
      ]}
    },
    shimmer: {
      rotation: { a: 1, k: [
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [360] }
      ]},
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [110, 110, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [95, 95, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100, 100, 100] }
      ]},
      opacity: { a: 1, k: [
        { t: 0, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [60], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 120, s: [100] }
      ]}
    }
  };

  const effect = effectKeyframes[effectType];
  const primary = hexToRgb(primaryColor);
  const secondary = hexToRgb(secondaryColor);
  const tertiary = hexToRgb(tertiaryColor);

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
      // Main animated shape
      {
        ddd: 0, ind: 1, ty: 4, nm: "Main Element", sr: 1,
        ks: {
          o: effect.opacity,
          r: effect.rotation,
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: effect.scale
        },
        ao: 0,
        shapes: [{
          ty: "gr",
          it: [
            shapeDefinitions[shape],
            { ty: "gf", o: { a: 0, k: 100 }, r: 1, bm: 0, g: { p: 3, k: { a: 0, k: [0, ...primary, 0.5, ...secondary, 1, ...tertiary] } }, s: { a: 0, k: [0, -45] }, e: { a: 0, k: [0, 45] }, t: 1 },
            { ty: "st", c: { a: 0, k: secondary }, o: { a: 0, k: 100 }, w: { a: 0, k: 2.5 } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ],
          nm: "Main Group"
        }],
        ip: 0, op: 120, st: 0
      },
      // Glow effect layer
      {
        ddd: 0, ind: 2, ty: 4, nm: "Outer Glow", sr: 1,
        ks: {
          o: { a: 1, k: [
            { t: 0, s: [25], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 60, s: [60], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 120, s: [25] }
          ]},
          r: { a: 0, k: 0 },
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 1, k: [
            { t: 0, s: [140, 140, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 60, s: [160, 160, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 120, s: [140, 140, 100] }
          ]}
        },
        ao: 0,
        shapes: [{
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [90, 90] } },
            { ty: "gf", o: { a: 0, k: 40 }, r: 1, bm: 0, g: { p: 2, k: { a: 0, k: [0, ...primary, 1, 0, 0, 0] } }, s: { a: 0, k: [0, 0] }, e: { a: 0, k: [45, 45] }, t: 2 },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ],
          nm: "Glow Group"
        }],
        ip: 0, op: 120, st: 0
      },
      // Particle sparkles
      {
        ddd: 0, ind: 3, ty: 4, nm: "Sparkle Particles", sr: 1,
        ks: {
          o: { a: 1, k: [
            { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 20, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 100, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 120, s: [0] }
          ]},
          r: { a: 1, k: [
            { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 120, s: [-360] }
          ]},
          p: { a: 0, k: [100, 100, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: { a: 0, k: [100, 100, 100] }
        },
        ao: 0,
        shapes: [
          // Multiple small sparkles
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 6 }, ir: { a: 0, k: 2 } },
            { ty: "fl", c: { a: 0, k: primary }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [55, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ], nm: "Spark1" },
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 5 }, ir: { a: 0, k: 2 } },
            { ty: "fl", c: { a: 0, k: secondary }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [-50, 25] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 80] }, r: { a: 0, k: 45 }, o: { a: 0, k: 100 } }
          ], nm: "Spark2" },
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 4 }, ir: { a: 0, k: 1 } },
            { ty: "fl", c: { a: 0, k: tertiary }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [30, -48] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [60, 60] }, r: { a: 0, k: 22 }, o: { a: 0, k: 100 } }
          ], nm: "Spark3" },
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 5 }, ir: { a: 0, k: 2 } },
            { ty: "fl", c: { a: 0, k: primary }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [-35, -40] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [70, 70] }, r: { a: 0, k: -30 }, o: { a: 0, k: 100 } }
          ], nm: "Spark4" }
        ],
        ip: 0, op: 120, st: 0
      }
    ]
  };
};

// ===================== PREMIUM ANIMATIONS COLLECTION - 100 ITEMS =====================
export const premiumAnimations: PremiumAnimation[] = [
  
  // ========== ENTRY BAR ANIMATIONS (15) ==========
  { id: 'entry_bronze_arrival', name: 'Bronze Arrival', category: 'entry_bar', tier: 'bronze', unlockLevel: 1, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Arrival', '#CD7F32', '#8B4513', '#A0522D', 'pulse', 'star') },
  { id: 'entry_silver_entrance', name: 'Silver Entrance', category: 'entry_bar', tier: 'silver', unlockLevel: 5, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Entrance', '#C0C0C0', '#A9A9A9', '#D3D3D3', 'glow', 'sparkle') },
  { id: 'entry_gold_royalty', name: 'Golden Royalty', category: 'entry_bar', tier: 'gold', unlockLevel: 10, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Golden Royalty', '#FFD700', '#FFA500', '#FFEC8B', 'sparkle', 'crown') },
  { id: 'entry_platinum_elegance', name: 'Platinum Elegance', category: 'entry_bar', tier: 'platinum', unlockLevel: 15, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Elegance', '#E5E4E2', '#B0C4DE', '#87CEEB', 'shimmer', 'ring') },
  { id: 'entry_diamond_dazzle', name: 'Diamond Dazzle', category: 'entry_bar', tier: 'diamond', unlockLevel: 25, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Dazzle', '#B9F2FF', '#00CED1', '#40E0D0', 'explosion', 'diamond') },
  { id: 'entry_legendary_flame', name: 'Legendary Flame', category: 'entry_bar', tier: 'legendary', unlockLevel: 40, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Flame', '#FF1493', '#9400D3', '#FF69B4', 'spiral', 'flame') },
  { id: 'entry_phoenix_rise', name: 'Phoenix Rise', category: 'entry_bar', tier: 'legendary', unlockLevel: 50, previewColor: '#FF4500', animationData: createAdvancedLottieAnimation('Phoenix Rise', '#FF4500', '#FF6347', '#FF8C00', 'explosion', 'flame') },
  { id: 'entry_royal_wings', name: 'Royal Wings', category: 'entry_bar', tier: 'diamond', unlockLevel: 30, previewColor: '#9400D3', animationData: createAdvancedLottieAnimation('Royal Wings', '#9400D3', '#4B0082', '#8A2BE2', 'float', 'wings') },
  { id: 'entry_thunder_strike', name: 'Thunder Strike', category: 'entry_bar', tier: 'platinum', unlockLevel: 20, previewColor: '#00BFFF', animationData: createAdvancedLottieAnimation('Thunder Strike', '#00BFFF', '#1E90FF', '#87CEFA', 'bounce', 'lightning') },
  { id: 'entry_cosmic_star', name: 'Cosmic Star', category: 'entry_bar', tier: 'gold', unlockLevel: 12, previewColor: '#DDA0DD', animationData: createAdvancedLottieAnimation('Cosmic Star', '#DDA0DD', '#BA55D3', '#EE82EE', 'rotate', 'star') },
  { id: 'entry_emerald_wave', name: 'Emerald Wave', category: 'entry_bar', tier: 'gold', unlockLevel: 14, previewColor: '#50C878', animationData: createAdvancedLottieAnimation('Emerald Wave', '#50C878', '#228B22', '#90EE90', 'wave', 'ring') },
  { id: 'entry_ruby_burst', name: 'Ruby Burst', category: 'entry_bar', tier: 'platinum', unlockLevel: 18, previewColor: '#E0115F', animationData: createAdvancedLottieAnimation('Ruby Burst', '#E0115F', '#DC143C', '#FF6B6B', 'explosion', 'diamond') },
  { id: 'entry_sapphire_flash', name: 'Sapphire Flash', category: 'entry_bar', tier: 'diamond', unlockLevel: 28, previewColor: '#0F52BA', animationData: createAdvancedLottieAnimation('Sapphire Flash', '#0F52BA', '#082567', '#4169E1', 'sparkle', 'lightning') },
  { id: 'entry_aurora_dream', name: 'Aurora Dream', category: 'entry_bar', tier: 'legendary', unlockLevel: 45, previewColor: '#00FF7F', animationData: createAdvancedLottieAnimation('Aurora Dream', '#00FF7F', '#7FFFD4', '#20B2AA', 'shimmer', 'flower') },
  { id: 'entry_celestial_gate', name: 'Celestial Gate', category: 'entry_bar', tier: 'legendary', unlockLevel: 55, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Celestial Gate', '#FFD700', '#FF1493', '#00CED1', 'spiral', 'hexagon') },

  // ========== PORTRAIT FRAME ANIMATIONS (15) ==========
  { id: 'frame_bronze_classic', name: 'Bronze Classic Frame', category: 'portrait_frame', tier: 'bronze', unlockLevel: 1, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Classic', '#CD7F32', '#8B4513', '#A0522D', 'glow', 'ring') },
  { id: 'frame_silver_shimmer', name: 'Silver Shimmer Frame', category: 'portrait_frame', tier: 'silver', unlockLevel: 5, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Shimmer', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'shimmer', 'ring') },
  { id: 'frame_gold_royal', name: 'Gold Royal Frame', category: 'portrait_frame', tier: 'gold', unlockLevel: 10, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Royal', '#FFD700', '#FFA500', '#FFEC8B', 'pulse', 'crown') },
  { id: 'frame_platinum_ice', name: 'Platinum Ice Frame', category: 'portrait_frame', tier: 'platinum', unlockLevel: 15, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Ice', '#E5E4E2', '#B0C4DE', '#ADD8E6', 'float', 'hexagon') },
  { id: 'frame_diamond_luxury', name: 'Diamond Luxury Frame', category: 'portrait_frame', tier: 'diamond', unlockLevel: 25, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Luxury', '#B9F2FF', '#00CED1', '#7FFFD4', 'sparkle', 'diamond') },
  { id: 'frame_legendary_fire', name: 'Legendary Fire Frame', category: 'portrait_frame', tier: 'legendary', unlockLevel: 40, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Fire', '#FF1493', '#9400D3', '#FF69B4', 'spiral', 'flame') },
  { id: 'frame_celestial_glow', name: 'Celestial Glow Frame', category: 'portrait_frame', tier: 'legendary', unlockLevel: 50, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Celestial Glow', '#FFD700', '#FF69B4', '#00CED1', 'glow', 'star') },
  { id: 'frame_ocean_deep', name: 'Ocean Deep Frame', category: 'portrait_frame', tier: 'platinum', unlockLevel: 18, previewColor: '#1E90FF', animationData: createAdvancedLottieAnimation('Ocean Deep', '#1E90FF', '#00008B', '#4169E1', 'wave', 'ring') },
  { id: 'frame_forest_spirit', name: 'Forest Spirit Frame', category: 'portrait_frame', tier: 'gold', unlockLevel: 12, previewColor: '#228B22', animationData: createAdvancedLottieAnimation('Forest Spirit', '#228B22', '#006400', '#32CD32', 'float', 'flower') },
  { id: 'frame_sunset_glory', name: 'Sunset Glory Frame', category: 'portrait_frame', tier: 'gold', unlockLevel: 14, previewColor: '#FF6347', animationData: createAdvancedLottieAnimation('Sunset Glory', '#FF6347', '#FF4500', '#FFA500', 'pulse', 'ring') },
  { id: 'frame_midnight_star', name: 'Midnight Star Frame', category: 'portrait_frame', tier: 'diamond', unlockLevel: 28, previewColor: '#191970', animationData: createAdvancedLottieAnimation('Midnight Star', '#191970', '#000080', '#4B0082', 'sparkle', 'star') },
  { id: 'frame_rose_petal', name: 'Rose Petal Frame', category: 'portrait_frame', tier: 'silver', unlockLevel: 7, previewColor: '#FF69B4', animationData: createAdvancedLottieAnimation('Rose Petal', '#FF69B4', '#FF1493', '#FFB6C1', 'float', 'heart') },
  { id: 'frame_thunder_bolt', name: 'Thunder Bolt Frame', category: 'portrait_frame', tier: 'diamond', unlockLevel: 32, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Thunder Bolt', '#FFD700', '#FF8C00', '#FFA500', 'bounce', 'lightning') },
  { id: 'frame_crystal_aura', name: 'Crystal Aura Frame', category: 'portrait_frame', tier: 'platinum', unlockLevel: 20, previewColor: '#E0FFFF', animationData: createAdvancedLottieAnimation('Crystal Aura', '#E0FFFF', '#AFEEEE', '#B0E0E6', 'shimmer', 'hexagon') },
  { id: 'frame_dragon_scale', name: 'Dragon Scale Frame', category: 'portrait_frame', tier: 'legendary', unlockLevel: 55, previewColor: '#8B0000', animationData: createAdvancedLottieAnimation('Dragon Scale', '#8B0000', '#FF0000', '#FF4500', 'explosion', 'shield') },

  // ========== PRIVILEGE STICKER ANIMATIONS (12) ==========
  { id: 'sticker_bronze_badge', name: 'Bronze Badge', category: 'privilege_sticker', tier: 'bronze', unlockLevel: 2, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Badge', '#CD7F32', '#8B4513', '#D2691E', 'bounce', 'shield') },
  { id: 'sticker_silver_star', name: 'Silver Star', category: 'privilege_sticker', tier: 'silver', unlockLevel: 6, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Star', '#C0C0C0', '#A9A9A9', '#D3D3D3', 'rotate', 'star') },
  { id: 'sticker_gold_crown', name: 'Gold Crown', category: 'privilege_sticker', tier: 'gold', unlockLevel: 11, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Crown', '#FFD700', '#FFA500', '#FFEC8B', 'sparkle', 'crown') },
  { id: 'sticker_platinum_gem', name: 'Platinum Gem', category: 'privilege_sticker', tier: 'platinum', unlockLevel: 16, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Gem', '#E5E4E2', '#B0C4DE', '#ADD8E6', 'pulse', 'diamond') },
  { id: 'sticker_diamond_sparkle', name: 'Diamond Sparkle', category: 'privilege_sticker', tier: 'diamond', unlockLevel: 26, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Sparkle', '#B9F2FF', '#00CED1', '#40E0D0', 'sparkle', 'sparkle') },
  { id: 'sticker_legendary_phoenix', name: 'Legendary Phoenix', category: 'privilege_sticker', tier: 'legendary', unlockLevel: 42, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Phoenix', '#FF1493', '#9400D3', '#FF4500', 'explosion', 'flame') },
  { id: 'sticker_ruby_heart', name: 'Ruby Heart', category: 'privilege_sticker', tier: 'gold', unlockLevel: 13, previewColor: '#DC143C', animationData: createAdvancedLottieAnimation('Ruby Heart', '#DC143C', '#B22222', '#FF6B6B', 'pulse', 'heart') },
  { id: 'sticker_sapphire_moon', name: 'Sapphire Moon', category: 'privilege_sticker', tier: 'platinum', unlockLevel: 19, previewColor: '#0F52BA', animationData: createAdvancedLottieAnimation('Sapphire Moon', '#0F52BA', '#000080', '#4169E1', 'float', 'ring') },
  { id: 'sticker_emerald_leaf', name: 'Emerald Leaf', category: 'privilege_sticker', tier: 'silver', unlockLevel: 8, previewColor: '#50C878', animationData: createAdvancedLottieAnimation('Emerald Leaf', '#50C878', '#228B22', '#90EE90', 'wave', 'flower') },
  { id: 'sticker_cosmic_ring', name: 'Cosmic Ring', category: 'privilege_sticker', tier: 'diamond', unlockLevel: 30, previewColor: '#9400D3', animationData: createAdvancedLottieAnimation('Cosmic Ring', '#9400D3', '#4B0082', '#8A2BE2', 'spiral', 'ring') },
  { id: 'sticker_thunder_shield', name: 'Thunder Shield', category: 'privilege_sticker', tier: 'diamond', unlockLevel: 35, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Thunder Shield', '#FFD700', '#FF8C00', '#00BFFF', 'bounce', 'shield') },
  { id: 'sticker_dragon_eye', name: 'Dragon Eye', category: 'privilege_sticker', tier: 'legendary', unlockLevel: 48, previewColor: '#FF4500', animationData: createAdvancedLottieAnimation('Dragon Eye', '#FF4500', '#8B0000', '#FF6347', 'glow', 'hexagon') },

  // ========== PRIVILEGE GIFT ANIMATIONS (12) ==========
  { id: 'gift_bronze_coin', name: 'Bronze Coin Gift', category: 'privilege_gift', tier: 'bronze', unlockLevel: 3, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Coin', '#CD7F32', '#8B4513', '#D2691E', 'rotate', 'ring') },
  { id: 'gift_silver_rose', name: 'Silver Rose Gift', category: 'privilege_gift', tier: 'silver', unlockLevel: 7, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Rose', '#C0C0C0', '#A9A9A9', '#FFB6C1', 'float', 'flower') },
  { id: 'gift_gold_heart', name: 'Gold Heart Gift', category: 'privilege_gift', tier: 'gold', unlockLevel: 11, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Heart', '#FFD700', '#FFA500', '#FF69B4', 'pulse', 'heart') },
  { id: 'gift_platinum_star', name: 'Platinum Star Gift', category: 'privilege_gift', tier: 'platinum', unlockLevel: 17, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Star', '#E5E4E2', '#B0C4DE', '#FFD700', 'sparkle', 'star') },
  { id: 'gift_diamond_crown', name: 'Diamond Crown Gift', category: 'privilege_gift', tier: 'diamond', unlockLevel: 27, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Crown', '#B9F2FF', '#00CED1', '#FFD700', 'explosion', 'crown') },
  { id: 'gift_legendary_unicorn', name: 'Legendary Unicorn', category: 'privilege_gift', tier: 'legendary', unlockLevel: 43, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Unicorn', '#FF1493', '#9400D3', '#FFD700', 'spiral', 'star') },
  { id: 'gift_ruby_diamond', name: 'Ruby Diamond Gift', category: 'privilege_gift', tier: 'diamond', unlockLevel: 32, previewColor: '#DC143C', animationData: createAdvancedLottieAnimation('Ruby Diamond', '#DC143C', '#B22222', '#B9F2FF', 'bounce', 'diamond') },
  { id: 'gift_ocean_pearl', name: 'Ocean Pearl Gift', category: 'privilege_gift', tier: 'platinum', unlockLevel: 21, previewColor: '#E0FFFF', animationData: createAdvancedLottieAnimation('Ocean Pearl', '#E0FFFF', '#AFEEEE', '#1E90FF', 'shimmer', 'ring') },
  { id: 'gift_sunset_flower', name: 'Sunset Flower Gift', category: 'privilege_gift', tier: 'gold', unlockLevel: 14, previewColor: '#FF6347', animationData: createAdvancedLottieAnimation('Sunset Flower', '#FF6347', '#FF4500', '#FFD700', 'wave', 'flower') },
  { id: 'gift_aurora_wings', name: 'Aurora Wings Gift', category: 'privilege_gift', tier: 'legendary', unlockLevel: 52, previewColor: '#00FF7F', animationData: createAdvancedLottieAnimation('Aurora Wings', '#00FF7F', '#7FFFD4', '#FF1493', 'float', 'wings') },
  { id: 'gift_thunder_bolt', name: 'Thunder Bolt Gift', category: 'privilege_gift', tier: 'diamond', unlockLevel: 36, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Thunder Bolt Gift', '#FFD700', '#FF8C00', '#00BFFF', 'bounce', 'lightning') },
  { id: 'gift_crystal_heart', name: 'Crystal Heart Gift', category: 'privilege_gift', tier: 'silver', unlockLevel: 9, previewColor: '#E0FFFF', animationData: createAdvancedLottieAnimation('Crystal Heart', '#E0FFFF', '#B0E0E6', '#FF69B4', 'pulse', 'heart') },

  // ========== ENTRANCE EFFECT ANIMATIONS (15) ==========
  { id: 'entrance_bronze_light', name: 'Bronze Light Entrance', category: 'entrance_effect', tier: 'bronze', unlockLevel: 1, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Light', '#CD7F32', '#8B4513', '#D2691E', 'glow', 'ring') },
  { id: 'entrance_silver_flash', name: 'Silver Flash Entrance', category: 'entrance_effect', tier: 'silver', unlockLevel: 5, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Flash', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'explosion', 'sparkle') },
  { id: 'entrance_gold_burst', name: 'Gold Burst Entrance', category: 'entrance_effect', tier: 'gold', unlockLevel: 10, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Burst', '#FFD700', '#FFA500', '#FFEC8B', 'explosion', 'star') },
  { id: 'entrance_platinum_wave', name: 'Platinum Wave Entrance', category: 'entrance_effect', tier: 'platinum', unlockLevel: 15, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Wave', '#E5E4E2', '#B0C4DE', '#87CEEB', 'wave', 'ring') },
  { id: 'entrance_diamond_storm', name: 'Diamond Storm Entrance', category: 'entrance_effect', tier: 'diamond', unlockLevel: 25, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Storm', '#B9F2FF', '#00CED1', '#40E0D0', 'spiral', 'diamond') },
  { id: 'entrance_legendary_inferno', name: 'Legendary Inferno', category: 'entrance_effect', tier: 'legendary', unlockLevel: 40, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Inferno', '#FF1493', '#9400D3', '#FF4500', 'explosion', 'flame') },
  { id: 'entrance_phoenix_blaze', name: 'Phoenix Blaze', category: 'entrance_effect', tier: 'legendary', unlockLevel: 50, previewColor: '#FF4500', animationData: createAdvancedLottieAnimation('Phoenix Blaze', '#FF4500', '#FF6347', '#FFD700', 'spiral', 'flame') },
  { id: 'entrance_thunder_crack', name: 'Thunder Crack', category: 'entrance_effect', tier: 'diamond', unlockLevel: 30, previewColor: '#00BFFF', animationData: createAdvancedLottieAnimation('Thunder Crack', '#00BFFF', '#1E90FF', '#FFD700', 'bounce', 'lightning') },
  { id: 'entrance_aurora_cascade', name: 'Aurora Cascade', category: 'entrance_effect', tier: 'platinum', unlockLevel: 20, previewColor: '#00FF7F', animationData: createAdvancedLottieAnimation('Aurora Cascade', '#00FF7F', '#7FFFD4', '#FF1493', 'shimmer', 'ring') },
  { id: 'entrance_cosmic_portal', name: 'Cosmic Portal', category: 'entrance_effect', tier: 'legendary', unlockLevel: 55, previewColor: '#9400D3', animationData: createAdvancedLottieAnimation('Cosmic Portal', '#9400D3', '#4B0082', '#00CED1', 'spiral', 'hexagon') },
  { id: 'entrance_rose_shower', name: 'Rose Shower', category: 'entrance_effect', tier: 'gold', unlockLevel: 12, previewColor: '#FF69B4', animationData: createAdvancedLottieAnimation('Rose Shower', '#FF69B4', '#FF1493', '#FFB6C1', 'float', 'flower') },
  { id: 'entrance_ocean_surge', name: 'Ocean Surge', category: 'entrance_effect', tier: 'platinum', unlockLevel: 18, previewColor: '#1E90FF', animationData: createAdvancedLottieAnimation('Ocean Surge', '#1E90FF', '#00008B', '#00CED1', 'wave', 'ring') },
  { id: 'entrance_star_explosion', name: 'Star Explosion', category: 'entrance_effect', tier: 'diamond', unlockLevel: 35, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Star Explosion', '#FFD700', '#FFA500', '#FF4500', 'explosion', 'star') },
  { id: 'entrance_dragon_roar', name: 'Dragon Roar', category: 'entrance_effect', tier: 'legendary', unlockLevel: 60, previewColor: '#8B0000', animationData: createAdvancedLottieAnimation('Dragon Roar', '#8B0000', '#FF0000', '#FFD700', 'explosion', 'flame') },
  { id: 'entrance_crystal_bloom', name: 'Crystal Bloom', category: 'entrance_effect', tier: 'silver', unlockLevel: 8, previewColor: '#E0FFFF', animationData: createAdvancedLottieAnimation('Crystal Bloom', '#E0FFFF', '#AFEEEE', '#B0E0E6', 'pulse', 'flower') },

  // ========== PARTY BACKGROUND ANIMATIONS (10) ==========
  { id: 'bg_bronze_glow', name: 'Bronze Glow Background', category: 'party_background', tier: 'bronze', unlockLevel: 3, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Glow', '#CD7F32', '#8B4513', '#D2691E', 'glow', 'ring') },
  { id: 'bg_silver_sparkle', name: 'Silver Sparkle Background', category: 'party_background', tier: 'silver', unlockLevel: 8, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Sparkle', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'sparkle', 'sparkle') },
  { id: 'bg_gold_royal', name: 'Gold Royal Background', category: 'party_background', tier: 'gold', unlockLevel: 15, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Royal', '#FFD700', '#FFA500', '#FFEC8B', 'shimmer', 'crown') },
  { id: 'bg_platinum_aurora', name: 'Platinum Aurora Background', category: 'party_background', tier: 'platinum', unlockLevel: 22, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Aurora', '#E5E4E2', '#B0C4DE', '#00FF7F', 'wave', 'ring') },
  { id: 'bg_diamond_cosmos', name: 'Diamond Cosmos Background', category: 'party_background', tier: 'diamond', unlockLevel: 30, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Cosmos', '#B9F2FF', '#00CED1', '#9400D3', 'spiral', 'star') },
  { id: 'bg_legendary_inferno', name: 'Legendary Inferno Background', category: 'party_background', tier: 'legendary', unlockLevel: 45, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Inferno', '#FF1493', '#9400D3', '#FF4500', 'explosion', 'flame') },
  { id: 'bg_ocean_dream', name: 'Ocean Dream Background', category: 'party_background', tier: 'platinum', unlockLevel: 25, previewColor: '#1E90FF', animationData: createAdvancedLottieAnimation('Ocean Dream', '#1E90FF', '#00008B', '#00CED1', 'wave', 'ring') },
  { id: 'bg_forest_magic', name: 'Forest Magic Background', category: 'party_background', tier: 'gold', unlockLevel: 18, previewColor: '#228B22', animationData: createAdvancedLottieAnimation('Forest Magic', '#228B22', '#006400', '#90EE90', 'float', 'flower') },
  { id: 'bg_sunset_paradise', name: 'Sunset Paradise Background', category: 'party_background', tier: 'diamond', unlockLevel: 35, previewColor: '#FF6347', animationData: createAdvancedLottieAnimation('Sunset Paradise', '#FF6347', '#FF4500', '#FFD700', 'shimmer', 'ring') },
  { id: 'bg_cosmic_galaxy', name: 'Cosmic Galaxy Background', category: 'party_background', tier: 'legendary', unlockLevel: 55, previewColor: '#9400D3', animationData: createAdvancedLottieAnimation('Cosmic Galaxy', '#9400D3', '#4B0082', '#00CED1', 'spiral', 'hexagon') },

  // ========== BADGE ANIMATIONS (11) ==========
  { id: 'badge_bronze_shield', name: 'Bronze Shield Badge', category: 'badge', tier: 'bronze', unlockLevel: 2, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Shield', '#CD7F32', '#8B4513', '#D2691E', 'pulse', 'shield') },
  { id: 'badge_silver_star', name: 'Silver Star Badge', category: 'badge', tier: 'silver', unlockLevel: 6, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Star', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'rotate', 'star') },
  { id: 'badge_gold_crown', name: 'Gold Crown Badge', category: 'badge', tier: 'gold', unlockLevel: 12, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Crown', '#FFD700', '#FFA500', '#FFEC8B', 'sparkle', 'crown') },
  { id: 'badge_platinum_diamond', name: 'Platinum Diamond Badge', category: 'badge', tier: 'platinum', unlockLevel: 18, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Diamond', '#E5E4E2', '#B0C4DE', '#B9F2FF', 'glow', 'diamond') },
  { id: 'badge_diamond_wings', name: 'Diamond Wings Badge', category: 'badge', tier: 'diamond', unlockLevel: 28, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Wings', '#B9F2FF', '#00CED1', '#FFD700', 'float', 'wings') },
  { id: 'badge_legendary_phoenix', name: 'Legendary Phoenix Badge', category: 'badge', tier: 'legendary', unlockLevel: 42, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Phoenix', '#FF1493', '#9400D3', '#FF4500', 'explosion', 'flame') },
  { id: 'badge_ruby_heart', name: 'Ruby Heart Badge', category: 'badge', tier: 'gold', unlockLevel: 14, previewColor: '#DC143C', animationData: createAdvancedLottieAnimation('Ruby Heart', '#DC143C', '#B22222', '#FF6B6B', 'pulse', 'heart') },
  { id: 'badge_sapphire_moon', name: 'Sapphire Moon Badge', category: 'badge', tier: 'platinum', unlockLevel: 20, previewColor: '#0F52BA', animationData: createAdvancedLottieAnimation('Sapphire Moon', '#0F52BA', '#000080', '#4169E1', 'shimmer', 'ring') },
  { id: 'badge_emerald_flower', name: 'Emerald Flower Badge', category: 'badge', tier: 'silver', unlockLevel: 8, previewColor: '#50C878', animationData: createAdvancedLottieAnimation('Emerald Flower', '#50C878', '#228B22', '#90EE90', 'wave', 'flower') },
  { id: 'badge_thunder_bolt', name: 'Thunder Bolt Badge', category: 'badge', tier: 'diamond', unlockLevel: 32, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Thunder Bolt', '#FFD700', '#FF8C00', '#00BFFF', 'bounce', 'lightning') },
  { id: 'badge_cosmic_hexagon', name: 'Cosmic Hexagon Badge', category: 'badge', tier: 'legendary', unlockLevel: 48, previewColor: '#9400D3', animationData: createAdvancedLottieAnimation('Cosmic Hexagon', '#9400D3', '#4B0082', '#00CED1', 'spiral', 'hexagon') },

  // ========== SPECIAL EFFECT ANIMATIONS (10) ==========
  { id: 'fx_bronze_spark', name: 'Bronze Spark Effect', category: 'special_effect', tier: 'bronze', unlockLevel: 4, previewColor: '#CD7F32', animationData: createAdvancedLottieAnimation('Bronze Spark', '#CD7F32', '#8B4513', '#D2691E', 'sparkle', 'sparkle') },
  { id: 'fx_silver_glow', name: 'Silver Glow Effect', category: 'special_effect', tier: 'silver', unlockLevel: 9, previewColor: '#C0C0C0', animationData: createAdvancedLottieAnimation('Silver Glow', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'glow', 'ring') },
  { id: 'fx_gold_explosion', name: 'Gold Explosion Effect', category: 'special_effect', tier: 'gold', unlockLevel: 16, previewColor: '#FFD700', animationData: createAdvancedLottieAnimation('Gold Explosion', '#FFD700', '#FFA500', '#FFEC8B', 'explosion', 'star') },
  { id: 'fx_platinum_shimmer', name: 'Platinum Shimmer Effect', category: 'special_effect', tier: 'platinum', unlockLevel: 23, previewColor: '#E5E4E2', animationData: createAdvancedLottieAnimation('Platinum Shimmer', '#E5E4E2', '#B0C4DE', '#ADD8E6', 'shimmer', 'diamond') },
  { id: 'fx_diamond_burst', name: 'Diamond Burst Effect', category: 'special_effect', tier: 'diamond', unlockLevel: 33, previewColor: '#B9F2FF', animationData: createAdvancedLottieAnimation('Diamond Burst', '#B9F2FF', '#00CED1', '#40E0D0', 'explosion', 'diamond') },
  { id: 'fx_legendary_flame', name: 'Legendary Flame Effect', category: 'special_effect', tier: 'legendary', unlockLevel: 47, previewColor: '#FF1493', animationData: createAdvancedLottieAnimation('Legendary Flame', '#FF1493', '#9400D3', '#FF4500', 'spiral', 'flame') },
  { id: 'fx_cosmic_wave', name: 'Cosmic Wave Effect', category: 'special_effect', tier: 'diamond', unlockLevel: 38, previewColor: '#9400D3', animationData: createAdvancedLottieAnimation('Cosmic Wave', '#9400D3', '#4B0082', '#00CED1', 'wave', 'hexagon') },
  { id: 'fx_thunder_storm', name: 'Thunder Storm Effect', category: 'special_effect', tier: 'platinum', unlockLevel: 26, previewColor: '#00BFFF', animationData: createAdvancedLottieAnimation('Thunder Storm', '#00BFFF', '#1E90FF', '#FFD700', 'bounce', 'lightning') },
  { id: 'fx_rose_petals', name: 'Rose Petals Effect', category: 'special_effect', tier: 'gold', unlockLevel: 19, previewColor: '#FF69B4', animationData: createAdvancedLottieAnimation('Rose Petals', '#FF69B4', '#FF1493', '#FFB6C1', 'float', 'flower') },
  { id: 'fx_dragon_breath', name: 'Dragon Breath Effect', category: 'special_effect', tier: 'legendary', unlockLevel: 58, previewColor: '#8B0000', animationData: createAdvancedLottieAnimation('Dragon Breath', '#8B0000', '#FF0000', '#FFD700', 'explosion', 'flame') }
];

// Helper functions
export const getAnimationsByCategory = (category: PremiumAnimation['category']): PremiumAnimation[] => {
  return premiumAnimations.filter(a => a.category === category);
};

export const getAnimationsByTier = (tier: PremiumAnimation['tier']): PremiumAnimation[] => {
  return premiumAnimations.filter(a => a.tier === tier);
};

export const getAnimationsByLevel = (level: number): PremiumAnimation[] => {
  return premiumAnimations.filter(a => a.unlockLevel <= level);
};

export const getAnimationById = (id: string): PremiumAnimation | undefined => {
  return premiumAnimations.find(a => a.id === id);
};

// Category Labels
export const categoryLabels: Record<PremiumAnimation['category'], string> = {
  entry_bar: 'Entry Bar',
  portrait_frame: 'Portrait Frame',
  privilege_sticker: 'Privilege Sticker',
  privilege_gift: 'Privilege Gift',
  entrance_effect: 'Entrance Effect',
  party_background: 'Party Background',
  badge: 'Badge',
  special_effect: 'Special Effect'
};

// Tier Labels
export const tierLabels: Record<PremiumAnimation['tier'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
  diamond: 'Diamond',
  legendary: 'Legendary'
};
