// Level Badge Animations - 60 Premium Lottie Animations for User/Host Levels
// These animations can be assigned to specific levels to display animated badges

export interface LevelBadgeAnimation {
  id: string;
  name: string;
  description: string;
  tier: 'basic' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legendary' | 'mythic';
  previewColor: string;
  animationData: object;
  forLevelRange?: { min: number; max: number };
}

// Lottie Animation Creator for Level Badges
const createLevelBadgeAnimation = (
  name: string,
  primaryColor: string,
  secondaryColor: string,
  accentColor: string,
  effect: 'pulse' | 'spin' | 'bounce' | 'glow' | 'sparkle' | 'wave' | 'float' | 'shimmer' | 'breath' | 'swing',
  shape: 'star' | 'heart' | 'crown' | 'diamond' | 'shield' | 'medal' | 'hexagon' | 'circle' | 'flame' | 'wings'
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
    star: { ty: "sr", pt: { a: 0, k: 5 }, sy: 1, or: { a: 0, k: 40 }, ir: { a: 0, k: 20 } },
    heart: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -22], [22, 6], [0, 32], [-22, 6]], i: [[10, 0], [0, 12], [-10, 0], [0, -12]], o: [[-10, 0], [0, 12], [10, 0], [0, -12]] } } },
    crown: { ty: "sh", ks: { a: 0, k: { c: true, v: [[-32, 16], [-22, -16], [-10, 0], [0, -22], [10, 0], [22, -16], [32, 16]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    diamond: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -32], [26, 0], [0, 40], [-26, 0]], i: [[0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0]] } } },
    shield: { ty: "sh", ks: { a: 0, k: { c: true, v: [[-28, -28], [28, -28], [28, 8], [0, 38], [-28, 8]], i: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], o: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]] } } },
    medal: { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [60, 60] } },
    hexagon: { ty: "sr", pt: { a: 0, k: 6 }, sy: 1, or: { a: 0, k: 32 }, ir: { a: 0, k: 32 } },
    circle: { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [55, 55] } },
    flame: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -40], [16, -16], [10, 8], [0, 26], [-10, 8], [-16, -16]], i: [[7, 0], [4, 10], [4, 7], [0, 0], [-4, 7], [-4, 10]], o: [[-7, 0], [-4, 10], [-4, 7], [0, 0], [4, 7], [4, 10]] } } },
    wings: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, 0], [32, -16], [48, 8], [32, 24], [0, 8]], i: [[0, 0], [7, 7], [0, 10], [-7, 7], [0, 0]], o: [[0, 0], [-7, -7], [0, -10], [7, -7], [0, 0]] } } }
  };

  const effectKeyframes: Record<string, { rotation: object; scale: object; opacity: object }> = {
    pulse: {
      rotation: { a: 0, k: 0 },
      scale: { a: 1, k: [
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [118, 118, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100, 100, 100] }
      ]},
      opacity: { a: 0, k: 100 }
    },
    spin: {
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [360] }
      ]},
    },
    bounce: {
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [115, 88, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [88, 115, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [105, 95, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100, 100, 100] }
      ]},
    },
    glow: {
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [108, 108, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100, 100, 100] }
      ]},
        { t: 0, s: [75], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [75] }
      ]}
    },
    sparkle: {
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [15], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [0] }
      ]},
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [115, 115, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [115, 115, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100, 100, 100] }
      ]},
        { t: 0, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [70], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [70], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100] }
      ]}
    },
    wave: {
        { t: 0, s: [-10], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [10], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [-10], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [10], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [-10] }
      ]},
    },
    float: {
        { t: 0, s: [-4], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [4], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [-4] }
      ]},
        { t: 0, s: [85], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [85] }
      ]}
    },
    shimmer: {
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [360] }
      ]},
        { t: 0, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 25, s: [112, 112, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 50, s: [95, 95, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100, 100, 100] }
      ]},
        { t: 0, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 25, s: [70], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 50, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100] }
      ]}
    },
    breath: {
        { t: 0, s: [95, 95, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [108, 108, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [95, 95, 100] }
      ]},
        { t: 0, s: [85], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [85] }
      ]}
    },
    swing: {
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 15, s: [18], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 30, s: [-15], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 45, s: [12], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 60, s: [-8], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [0] }
      ]},
    }
  };

  const eff = effectKeyframes[effect];
  const p1 = hexToRgb(primaryColor);
  const p2 = hexToRgb(secondaryColor);
  const p3 = hexToRgb(accentColor);

  return {
    v: "5.7.4",
    fr: 60,
    ip: 0,
    op: 80,
    w: 120,
    h: 120,
    nm: name,
    ddd: 0,
    assets: [],
    layers: [
      // Main shape layer
      {
        ks: {
          o: eff.opacity,
          r: eff.rotation,
          p: { a: 0, k: [60, 60, 0] },
          a: { a: 0, k: [0, 0, 0] },
          s: eff.scale
        },
        ao: 0,
        shapes: [{
          ty: "gr",
          it: [
            shapeData[shape],
            { ty: "gf", o: { a: 0, k: 100 }, r: 1, bm: 0, g: { p: 3, k: { a: 0, k: [0, ...p1, 0.5, ...p2, 1, ...p3] } }, s: { a: 0, k: [0, -35] }, e: { a: 0, k: [0, 35] }, t: 1 },
            { ty: "st", c: { a: 0, k: p2 }, o: { a: 0, k: 100 }, w: { a: 0, k: 2 } },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ],
        }],
      },
      // Outer glow
      {
            { t: 0, s: [30], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 40, s: [55], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 80, s: [30] }
          ]},
            { t: 0, s: [125, 125, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 40, s: [145, 145, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 80, s: [125, 125, 100] }
          ]}
        },
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [70, 70] } },
            { ty: "gf", o: { a: 0, k: 45 }, r: 1, bm: 0, g: { p: 2, k: { a: 0, k: [0, ...p1, 1, 0, 0, 0] } }, s: { a: 0, k: [0, 0] }, e: { a: 0, k: [35, 35] }, t: 2 },
            { ty: "tr", p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ],
        }],
      },
      // Small sparkles
      {
            { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 15, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 65, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 80, s: [0] }
          ]},
            { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
            { t: 80, s: [-360] }
          ]},
        },
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 5 }, ir: { a: 0, k: 2 } },
            { ty: "fl", c: { a: 0, k: p1 }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [42, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } }
          ], nm: "S1" },
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 4 }, ir: { a: 0, k: 1.5 } },
            { ty: "fl", c: { a: 0, k: p2 }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [-38, 18] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 80] }, r: { a: 0, k: 45 }, o: { a: 0, k: 100 } }
          ], nm: "S2" },
          { ty: "gr", it: [
            { ty: "sr", pt: { a: 0, k: 4 }, sy: 1, or: { a: 0, k: 3.5 }, ir: { a: 0, k: 1 } },
            { ty: "fl", c: { a: 0, k: p3 }, o: { a: 0, k: 100 } },
            { ty: "tr", p: { a: 0, k: [24, -36] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [65, 65] }, r: { a: 0, k: 22 }, o: { a: 0, k: 100 } }
          ], nm: "S3" }
        ],
      }
    ]
  };
};

// ===================== LEVEL BADGE ANIMATIONS - 60 ITEMS =====================
export const levelBadgeAnimations: LevelBadgeAnimation[] = [
  
  // ========== BASIC TIER (Level 0-4) - 6 animations ==========
  { id: 'badge_newbie_star', name: 'Newbie Star', description: 'Simple pulsing star for new users', tier: 'basic', previewColor: '#9CA3AF', animationData: createLevelBadgeAnimation('Newbie Star', '#9CA3AF', '#6B7280', '#D1D5DB', 'pulse', 'star'), forLevelRange: { min: 0, max: 1 } },
  { id: 'badge_starter_heart', name: 'Starter Heart', description: 'Gentle bouncing heart', tier: 'basic', previewColor: '#F472B6', animationData: createLevelBadgeAnimation('Starter Heart', '#F472B6', '#EC4899', '#FBCFE8', 'bounce', 'heart'), forLevelRange: { min: 0, max: 2 } },
  { id: 'badge_fresh_circle', name: 'Fresh Circle', description: 'Smooth breathing circle', tier: 'basic', previewColor: '#60A5FA', animationData: createLevelBadgeAnimation('Fresh Circle', '#60A5FA', '#3B82F6', '#BFDBFE', 'breath', 'circle'), forLevelRange: { min: 0, max: 3 } },
  { id: 'badge_basic_shield', name: 'Basic Shield', description: 'Simple shield with glow', tier: 'basic', previewColor: '#34D399', animationData: createLevelBadgeAnimation('Basic Shield', '#34D399', '#10B981', '#A7F3D0', 'glow', 'shield'), forLevelRange: { min: 1, max: 4 } },
  { id: 'badge_beginner_hex', name: 'Beginner Hex', description: 'Floating hexagon', tier: 'basic', previewColor: '#A78BFA', animationData: createLevelBadgeAnimation('Beginner Hex', '#A78BFA', '#8B5CF6', '#DDD6FE', 'float', 'hexagon'), forLevelRange: { min: 2, max: 4 } },
  { id: 'badge_simple_medal', name: 'Simple Medal', description: 'Basic medal animation', tier: 'basic', previewColor: '#FBBF24', animationData: createLevelBadgeAnimation('Simple Medal', '#FBBF24', '#F59E0B', '#FDE68A', 'wave', 'medal'), forLevelRange: { min: 3, max: 4 } },

  // ========== BRONZE TIER (Level 5-9) - 7 animations ==========
  { id: 'badge_bronze_star', name: 'Bronze Star', description: 'Shimmering bronze star', tier: 'bronze', previewColor: '#CD7F32', animationData: createLevelBadgeAnimation('Bronze Star', '#CD7F32', '#B8860B', '#DEB887', 'shimmer', 'star'), forLevelRange: { min: 5, max: 6 } },
  { id: 'badge_copper_crown', name: 'Copper Crown', description: 'Glowing copper crown', tier: 'bronze', previewColor: '#B87333', animationData: createLevelBadgeAnimation('Copper Crown', '#B87333', '#8B4513', '#D2691E', 'glow', 'crown'), forLevelRange: { min: 5, max: 7 } },
  { id: 'badge_bronze_shield', name: 'Bronze Shield', description: 'Solid bronze shield', tier: 'bronze', previewColor: '#A0522D', animationData: createLevelBadgeAnimation('Bronze Shield', '#A0522D', '#8B4513', '#CD853F', 'pulse', 'shield'), forLevelRange: { min: 6, max: 8 } },
  { id: 'badge_rustic_diamond', name: 'Rustic Diamond', description: 'Earthy diamond sparkle', tier: 'bronze', previewColor: '#C19A6B', animationData: createLevelBadgeAnimation('Rustic Diamond', '#C19A6B', '#8B4513', '#DEB887', 'sparkle', 'diamond'), forLevelRange: { min: 6, max: 9 } },
  { id: 'badge_autumn_flame', name: 'Autumn Flame', description: 'Warm autumn colored flame', tier: 'bronze', previewColor: '#D2691E', animationData: createLevelBadgeAnimation('Autumn Flame', '#D2691E', '#A0522D', '#F4A460', 'wave', 'flame'), forLevelRange: { min: 7, max: 9 } },
  { id: 'badge_bronze_medal', name: 'Bronze Medal', description: 'Classic bronze medal swing', tier: 'bronze', previewColor: '#CD853F', animationData: createLevelBadgeAnimation('Bronze Medal', '#CD853F', '#8B4513', '#DEB887', 'swing', 'medal'), forLevelRange: { min: 8, max: 9 } },
  { id: 'badge_earth_hex', name: 'Earth Hexagon', description: 'Earthen hexagon glow', tier: 'bronze', previewColor: '#8B4513', animationData: createLevelBadgeAnimation('Earth Hexagon', '#8B4513', '#654321', '#A0522D', 'breath', 'hexagon'), forLevelRange: { min: 8, max: 9 } },

  // ========== SILVER TIER (Level 10-14) - 8 animations ==========
  { id: 'badge_silver_star', name: 'Silver Star', description: 'Elegant silver star', tier: 'silver', previewColor: '#C0C0C0', animationData: createLevelBadgeAnimation('Silver Star', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'sparkle', 'star'), forLevelRange: { min: 10, max: 11 } },
  { id: 'badge_moonlight_crown', name: 'Moonlight Crown', description: 'Soft silver crown', tier: 'silver', previewColor: '#D3D3D3', animationData: createLevelBadgeAnimation('Moonlight Crown', '#D3D3D3', '#B0C4DE', '#F0F8FF', 'glow', 'crown'), forLevelRange: { min: 10, max: 12 } },
  { id: 'badge_steel_shield', name: 'Steel Shield', description: 'Strong steel shield', tier: 'silver', previewColor: '#708090', animationData: createLevelBadgeAnimation('Steel Shield', '#708090', '#4682B4', '#B0C4DE', 'pulse', 'shield'), forLevelRange: { min: 11, max: 13 } },
  { id: 'badge_silver_diamond', name: 'Silver Diamond', description: 'Brilliant silver diamond', tier: 'silver', previewColor: '#E8E8E8', animationData: createLevelBadgeAnimation('Silver Diamond', '#E8E8E8', '#C0C0C0', '#FFFFFF', 'shimmer', 'diamond'), forLevelRange: { min: 11, max: 13 } },
  { id: 'badge_ice_heart', name: 'Ice Heart', description: 'Cool icy heart', tier: 'silver', previewColor: '#ADD8E6', animationData: createLevelBadgeAnimation('Ice Heart', '#ADD8E6', '#87CEEB', '#E0FFFF', 'bounce', 'heart'), forLevelRange: { min: 12, max: 14 } },
  { id: 'badge_silver_medal', name: 'Silver Medal', description: 'Prestigious silver medal', tier: 'silver', previewColor: '#A9A9A9', animationData: createLevelBadgeAnimation('Silver Medal', '#A9A9A9', '#808080', '#D3D3D3', 'swing', 'medal'), forLevelRange: { min: 12, max: 14 } },
  { id: 'badge_mist_wings', name: 'Mist Wings', description: 'Ethereal misty wings', tier: 'silver', previewColor: '#B0C4DE', animationData: createLevelBadgeAnimation('Mist Wings', '#B0C4DE', '#778899', '#E6E6FA', 'float', 'wings'), forLevelRange: { min: 13, max: 14 } },
  { id: 'badge_chrome_hex', name: 'Chrome Hexagon', description: 'Sleek chrome hexagon', tier: 'silver', previewColor: '#C4C4C4', animationData: createLevelBadgeAnimation('Chrome Hexagon', '#C4C4C4', '#9E9E9E', '#E0E0E0', 'spin', 'hexagon'), forLevelRange: { min: 13, max: 14 } },

  // ========== GOLD TIER (Level 15-24) - 10 animations ==========
  { id: 'badge_golden_star', name: 'Golden Star', description: 'Radiant golden star', tier: 'gold', previewColor: '#FFD700', animationData: createLevelBadgeAnimation('Golden Star', '#FFD700', '#FFA500', '#FFEC8B', 'sparkle', 'star'), forLevelRange: { min: 15, max: 17 } },
  { id: 'badge_royal_crown', name: 'Royal Crown', description: 'Majestic golden crown', tier: 'gold', previewColor: '#DAA520', animationData: createLevelBadgeAnimation('Royal Crown', '#DAA520', '#B8860B', '#FFD700', 'shimmer', 'crown'), forLevelRange: { min: 15, max: 18 } },
  { id: 'badge_sun_shield', name: 'Sun Shield', description: 'Blazing sun shield', tier: 'gold', previewColor: '#FFA500', animationData: createLevelBadgeAnimation('Sun Shield', '#FFA500', '#FF8C00', '#FFD700', 'glow', 'shield'), forLevelRange: { min: 16, max: 19 } },
  { id: 'badge_gold_diamond', name: 'Gold Diamond', description: 'Precious golden diamond', tier: 'gold', previewColor: '#FFE135', animationData: createLevelBadgeAnimation('Gold Diamond', '#FFE135', '#FFD700', '#FFFACD', 'bounce', 'diamond'), forLevelRange: { min: 17, max: 20 } },
  { id: 'badge_amber_heart', name: 'Amber Heart', description: 'Warm amber heart', tier: 'gold', previewColor: '#FFBF00', animationData: createLevelBadgeAnimation('Amber Heart', '#FFBF00', '#FF8C00', '#FFE4B5', 'pulse', 'heart'), forLevelRange: { min: 18, max: 21 } },
  { id: 'badge_gold_medal', name: 'Gold Medal', description: 'Champion gold medal', tier: 'gold', previewColor: '#FFD700', animationData: createLevelBadgeAnimation('Gold Medal', '#FFD700', '#DAA520', '#FAFAD2', 'swing', 'medal'), forLevelRange: { min: 19, max: 22 } },
  { id: 'badge_solar_flame', name: 'Solar Flame', description: 'Intense solar flame', tier: 'gold', previewColor: '#FF8C00', animationData: createLevelBadgeAnimation('Solar Flame', '#FF8C00', '#FF4500', '#FFD700', 'wave', 'flame'), forLevelRange: { min: 20, max: 23 } },
  { id: 'badge_golden_wings', name: 'Golden Wings', description: 'Magnificent golden wings', tier: 'gold', previewColor: '#FFD700', animationData: createLevelBadgeAnimation('Golden Wings', '#FFD700', '#FFA500', '#FFFACD', 'float', 'wings'), forLevelRange: { min: 21, max: 24 } },
  { id: 'badge_honey_hex', name: 'Honey Hexagon', description: 'Sweet honey hexagon', tier: 'gold', previewColor: '#F0B000', animationData: createLevelBadgeAnimation('Honey Hexagon', '#F0B000', '#E5A000', '#FFD54F', 'breath', 'hexagon'), forLevelRange: { min: 22, max: 24 } },
  { id: 'badge_treasure_circle', name: 'Treasure Circle', description: 'Spinning treasure circle', tier: 'gold', previewColor: '#DAA520', animationData: createLevelBadgeAnimation('Treasure Circle', '#DAA520', '#B8860B', '#FFD700', 'spin', 'circle'), forLevelRange: { min: 23, max: 24 } },

  // ========== PLATINUM TIER (Level 25-34) - 9 animations ==========
  { id: 'badge_platinum_star', name: 'Platinum Star', description: 'Premium platinum star', tier: 'platinum', previewColor: '#E5E4E2', animationData: createLevelBadgeAnimation('Platinum Star', '#E5E4E2', '#A8A9AD', '#FAFAFA', 'shimmer', 'star'), forLevelRange: { min: 25, max: 27 } },
  { id: 'badge_frost_crown', name: 'Frost Crown', description: 'Icy platinum crown', tier: 'platinum', previewColor: '#B0E0E6', animationData: createLevelBadgeAnimation('Frost Crown', '#B0E0E6', '#87CEEB', '#F0FFFF', 'glow', 'crown'), forLevelRange: { min: 25, max: 28 } },
  { id: 'badge_crystal_shield', name: 'Crystal Shield', description: 'Clear crystal shield', tier: 'platinum', previewColor: '#E0E0E0', animationData: createLevelBadgeAnimation('Crystal Shield', '#E0E0E0', '#C0C0C0', '#FFFFFF', 'sparkle', 'shield'), forLevelRange: { min: 26, max: 29 } },
  { id: 'badge_platinum_diamond', name: 'Platinum Diamond', description: 'Flawless platinum diamond', tier: 'platinum', previewColor: '#E8E8E8', animationData: createLevelBadgeAnimation('Platinum Diamond', '#E8E8E8', '#D3D3D3', '#FFFFFF', 'bounce', 'diamond'), forLevelRange: { min: 27, max: 30 } },
  { id: 'badge_pearl_heart', name: 'Pearl Heart', description: 'Lustrous pearl heart', tier: 'platinum', previewColor: '#FDEEF4', animationData: createLevelBadgeAnimation('Pearl Heart', '#FDEEF4', '#F8BBD9', '#FFFFFF', 'pulse', 'heart'), forLevelRange: { min: 28, max: 31 } },
  { id: 'badge_platinum_medal', name: 'Platinum Medal', description: 'Elite platinum medal', tier: 'platinum', previewColor: '#E5E4E2', animationData: createLevelBadgeAnimation('Platinum Medal', '#E5E4E2', '#C0C0C0', '#FFFFFF', 'swing', 'medal'), forLevelRange: { min: 29, max: 32 } },
  { id: 'badge_aurora_wings', name: 'Aurora Wings', description: 'Northern lights wings', tier: 'platinum', previewColor: '#7DD1F0', animationData: createLevelBadgeAnimation('Aurora Wings', '#7DD1F0', '#00CED1', '#E0FFFF', 'float', 'wings'), forLevelRange: { min: 30, max: 33 } },
  { id: 'badge_winter_flame', name: 'Winter Flame', description: 'Cool winter flame', tier: 'platinum', previewColor: '#5DADE2', animationData: createLevelBadgeAnimation('Winter Flame', '#5DADE2', '#3498DB', '#AED6F1', 'wave', 'flame'), forLevelRange: { min: 31, max: 34 } },
  { id: 'badge_titanium_hex', name: 'Titanium Hexagon', description: 'Strong titanium hexagon', tier: 'platinum', previewColor: '#C8D4E3', animationData: createLevelBadgeAnimation('Titanium Hexagon', '#C8D4E3', '#A3B7CC', '#E8EEF2', 'spin', 'hexagon'), forLevelRange: { min: 32, max: 34 } },

  // ========== DIAMOND TIER (Level 35-49) - 10 animations ==========
  { id: 'badge_diamond_star', name: 'Diamond Star', description: 'Brilliant diamond star', tier: 'diamond', previewColor: '#B9F2FF', animationData: createLevelBadgeAnimation('Diamond Star', '#B9F2FF', '#00CED1', '#E0FFFF', 'shimmer', 'star'), forLevelRange: { min: 35, max: 38 } },
  { id: 'badge_sapphire_crown', name: 'Sapphire Crown', description: 'Royal sapphire crown', tier: 'diamond', previewColor: '#0F52BA', animationData: createLevelBadgeAnimation('Sapphire Crown', '#0F52BA', '#1E90FF', '#87CEEB', 'glow', 'crown'), forLevelRange: { min: 35, max: 40 } },
  { id: 'badge_diamond_shield', name: 'Diamond Shield', description: 'Unbreakable diamond shield', tier: 'diamond', previewColor: '#40E0D0', animationData: createLevelBadgeAnimation('Diamond Shield', '#40E0D0', '#00CED1', '#AFEEEE', 'sparkle', 'shield'), forLevelRange: { min: 37, max: 42 } },
  { id: 'badge_aqua_diamond', name: 'Aqua Diamond', description: 'Crystal clear aqua diamond', tier: 'diamond', previewColor: '#00FFFF', animationData: createLevelBadgeAnimation('Aqua Diamond', '#00FFFF', '#00CED1', '#E0FFFF', 'bounce', 'diamond'), forLevelRange: { min: 38, max: 43 } },
  { id: 'badge_ocean_heart', name: 'Ocean Heart', description: 'Deep ocean heart', tier: 'diamond', previewColor: '#1E90FF', animationData: createLevelBadgeAnimation('Ocean Heart', '#1E90FF', '#0000CD', '#87CEFA', 'pulse', 'heart'), forLevelRange: { min: 40, max: 45 } },
  { id: 'badge_diamond_medal', name: 'Diamond Medal', description: 'Supreme diamond medal', tier: 'diamond', previewColor: '#00CED1', animationData: createLevelBadgeAnimation('Diamond Medal', '#00CED1', '#20B2AA', '#AFEEEE', 'swing', 'medal'), forLevelRange: { min: 41, max: 46 } },
  { id: 'badge_ice_wings', name: 'Ice Wings', description: 'Frozen ice wings', tier: 'diamond', previewColor: '#ADD8E6', animationData: createLevelBadgeAnimation('Ice Wings', '#ADD8E6', '#00BFFF', '#F0FFFF', 'float', 'wings'), forLevelRange: { min: 43, max: 47 } },
  { id: 'badge_crystal_flame', name: 'Crystal Flame', description: 'Blue crystal flame', tier: 'diamond', previewColor: '#00BFFF', animationData: createLevelBadgeAnimation('Crystal Flame', '#00BFFF', '#1E90FF', '#87CEFA', 'wave', 'flame'), forLevelRange: { min: 44, max: 48 } },
  { id: 'badge_gem_hex', name: 'Gem Hexagon', description: 'Precious gem hexagon', tier: 'diamond', previewColor: '#5B8FB9', animationData: createLevelBadgeAnimation('Gem Hexagon', '#5B8FB9', '#4682B4', '#87CEEB', 'spin', 'hexagon'), forLevelRange: { min: 46, max: 49 } },
  { id: 'badge_azure_circle', name: 'Azure Circle', description: 'Perfect azure circle', tier: 'diamond', previewColor: '#007FFF', animationData: createLevelBadgeAnimation('Azure Circle', '#007FFF', '#0066CC', '#66B2FF', 'breath', 'circle'), forLevelRange: { min: 47, max: 49 } },

  // ========== LEGENDARY TIER (Level 50-69) - 8 animations ==========
  { id: 'badge_legendary_star', name: 'Legendary Star', description: 'Epic legendary star', tier: 'legendary', previewColor: '#FF1493', animationData: createLevelBadgeAnimation('Legendary Star', '#FF1493', '#FF00FF', '#FFB6C1', 'shimmer', 'star'), forLevelRange: { min: 50, max: 55 } },
  { id: 'badge_phoenix_crown', name: 'Phoenix Crown', description: 'Mythical phoenix crown', tier: 'legendary', previewColor: '#FF4500', animationData: createLevelBadgeAnimation('Phoenix Crown', '#FF4500', '#DC143C', '#FF6347', 'glow', 'crown'), forLevelRange: { min: 52, max: 58 } },
  { id: 'badge_dragon_shield', name: 'Dragon Shield', description: 'Ancient dragon shield', tier: 'legendary', previewColor: '#8B008B', animationData: createLevelBadgeAnimation('Dragon Shield', '#8B008B', '#9400D3', '#DA70D6', 'sparkle', 'shield'), forLevelRange: { min: 55, max: 62 } },
  { id: 'badge_cosmic_diamond', name: 'Cosmic Diamond', description: 'Otherworldly cosmic diamond', tier: 'legendary', previewColor: '#9400D3', animationData: createLevelBadgeAnimation('Cosmic Diamond', '#9400D3', '#8A2BE2', '#E6E6FA', 'bounce', 'diamond'), forLevelRange: { min: 56, max: 64 } },
  { id: 'badge_eternal_heart', name: 'Eternal Heart', description: 'Everlasting eternal heart', tier: 'legendary', previewColor: '#C71585', animationData: createLevelBadgeAnimation('Eternal Heart', '#C71585', '#DB7093', '#FFB6C1', 'pulse', 'heart'), forLevelRange: { min: 58, max: 66 } },
  { id: 'badge_supreme_wings', name: 'Supreme Wings', description: 'Godlike supreme wings', tier: 'legendary', previewColor: '#BA55D3', animationData: createLevelBadgeAnimation('Supreme Wings', '#BA55D3', '#9370DB', '#DDA0DD', 'float', 'wings'), forLevelRange: { min: 60, max: 68 } },
  { id: 'badge_inferno_flame', name: 'Inferno Flame', description: 'Hellish inferno flame', tier: 'legendary', previewColor: '#FF0000', animationData: createLevelBadgeAnimation('Inferno Flame', '#FF0000', '#8B0000', '#FF4500', 'wave', 'flame'), forLevelRange: { min: 62, max: 69 } },
  { id: 'badge_mystic_hex', name: 'Mystic Hexagon', description: 'Mysterious mystic hexagon', tier: 'legendary', previewColor: '#4B0082', animationData: createLevelBadgeAnimation('Mystic Hexagon', '#4B0082', '#8B008B', '#9370DB', 'spin', 'hexagon'), forLevelRange: { min: 64, max: 69 } },

  // ========== MYTHIC TIER (Level 70+) - 6 animations ==========
  { id: 'badge_mythic_star', name: 'Mythic Star', description: 'Ultimate mythic star', tier: 'mythic', previewColor: '#FFD700', animationData: createLevelBadgeAnimation('Mythic Star', '#FFD700', '#FF1493', '#FFFFFF', 'shimmer', 'star'), forLevelRange: { min: 70, max: 80 } },
  { id: 'badge_emperor_crown', name: 'Emperor Crown', description: 'All-powerful emperor crown', tier: 'mythic', previewColor: '#FFD700', animationData: createLevelBadgeAnimation('Emperor Crown', '#FFD700', '#FF4500', '#FFFACD', 'glow', 'crown'), forLevelRange: { min: 75, max: 90 } },
  { id: 'badge_godly_diamond', name: 'Godly Diamond', description: 'Divine godly diamond', tier: 'mythic', previewColor: '#FFFFFF', animationData: createLevelBadgeAnimation('Godly Diamond', '#FFFFFF', '#FFD700', '#F0F0F0', 'sparkle', 'diamond'), forLevelRange: { min: 80, max: 100 } },
  { id: 'badge_celestial_wings', name: 'Celestial Wings', description: 'Heavenly celestial wings', tier: 'mythic', previewColor: '#FFFAF0', animationData: createLevelBadgeAnimation('Celestial Wings', '#FFFAF0', '#FFD700', '#FFF8DC', 'float', 'wings'), forLevelRange: { min: 85, max: 100 } },
  { id: 'badge_divine_flame', name: 'Divine Flame', description: 'Holy divine flame', tier: 'mythic', previewColor: '#FFFAFA', animationData: createLevelBadgeAnimation('Divine Flame', '#FFFAFA', '#FFD700', '#FFFFF0', 'wave', 'flame'), forLevelRange: { min: 90, max: 100 } },
  { id: 'badge_omega_circle', name: 'Omega Circle', description: 'The ultimate omega circle', tier: 'mythic', previewColor: '#000000', animationData: createLevelBadgeAnimation('Omega Circle', '#000000', '#FFD700', '#1C1C1C', 'breath', 'circle'), forLevelRange: { min: 95, max: 100 } }
];

// Helper functions
export const getAnimationsByTier = (tier: LevelBadgeAnimation['tier']): LevelBadgeAnimation[] => 
  levelBadgeAnimations.filter(anim => anim.tier === tier);

export const getAnimationForLevel = (level: number): LevelBadgeAnimation[] => 
  levelBadgeAnimations.filter(anim => 
    anim.forLevelRange && level >= anim.forLevelRange.min && level <= anim.forLevelRange.max
  );

export const getAnimationById = (id: string): LevelBadgeAnimation | undefined => 
  levelBadgeAnimations.find(anim => anim.id === id);

// Tier labels
export const tierLabels: Record<LevelBadgeAnimation['tier'], { label: string; color: string }> = {
  basic: { label: 'Basic', color: '#9CA3AF' },
  bronze: { label: 'Bronze', color: '#CD7F32' },
  silver: { label: 'Silver', color: '#C0C0C0' },
  gold: { label: 'Gold', color: '#FFD700' },
  platinum: { label: 'Platinum', color: '#E5E4E2' },
  diamond: { label: 'Diamond', color: '#00CED1' },
  legendary: { label: 'Legendary', color: '#9400D3' },
  mythic: { label: 'Mythic', color: '#FFD700' }
};

// Tier order for sorting
export const tierOrder: LevelBadgeAnimation['tier'][] = ['basic', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary', 'mythic'];
