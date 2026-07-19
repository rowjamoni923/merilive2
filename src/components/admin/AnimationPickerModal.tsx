import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, Crown, Star, Diamond, Flame, Shield, Heart, Zap,
  Search, Check, X, Play, ChevronDown, Eye, Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Lottie from 'lottie-react';
import { cn } from '@/lib/utils';

// 50 Premium Level Animations
export interface LevelAnimation {
  id: string;
  name: string;
  tier: 'basic' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | 'legendary' | 'mythic';
  previewColor: string;
  effect: string;
  animationData: object;
}

const tierColors: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
 basic: { bg: 'bg-slate-100 ', border: 'border-slate-300', text: 'text-slate-600', gradient: 'from-slate-400 to-slate-600' },
 bronze: { bg: 'bg-amber-100 ', border: 'border-amber-400', text: 'text-amber-700', gradient: 'from-amber-600 to-amber-800' },
 silver: { bg: 'bg-gray-100 ', border: 'border-gray-400', text: 'text-gray-600', gradient: 'from-gray-400 to-gray-600' },
 gold: { bg: 'bg-yellow-100 ', border: 'border-yellow-500', text: 'text-yellow-700', gradient: 'from-yellow-400 to-amber-500' },
 platinum: { bg: 'bg-blue-100 ', border: 'border-blue-400', text: 'text-blue-600', gradient: 'from-blue-300 to-blue-500' },
 diamond: { bg: 'bg-cyan-100 ', border: 'border-cyan-400', text: 'text-cyan-600', gradient: 'from-cyan-300 to-cyan-500' },
 legendary: { bg: 'bg-purple-100 ', border: 'border-purple-500', text: 'text-purple-600', gradient: 'from-purple-500 to-pink-500' },
 mythic: { bg: 'bg-rose-100 ', border: 'border-rose-500', text: 'text-rose-600', gradient: 'from-rose-500 to-orange-500' }
};

const tierLabels: Record<string, { en: string; bn: string }> = {
  basic: { en: 'Basic', bn: 'Basic' },
  bronze: { en: 'Bronze', bn: 'Bronze' },
  silver: { en: 'Silver', bn: 'Silver' },
  gold: { en: 'Gold', bn: 'Gold' },
  platinum: { en: 'Platinum', bn: 'Platinum' },
  diamond: { en: 'Diamond', bn: 'Diamond' },
  legendary: { en: 'Legendary', bn: 'Legendary' },
  mythic: { en: 'Mythic', bn: 'Mythic' }
};

// Animation generator
const createPremiumAnimation = (
  name: string,
  primaryColor: string,
  secondaryColor: string,
  accentColor: string,
  effect: 'pulse' | 'spin' | 'bounce' | 'glow' | 'sparkle' | 'wave' | 'float' | 'shimmer' | 'breath' | 'swing' | 'explosion' | 'ripple',
  shape: 'star' | 'heart' | 'crown' | 'diamond' | 'shield' | 'medal' | 'hexagon' | 'circle' | 'flame' | 'wings' | 'ring' | 'phoenix'
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
    wings: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, 0], [32, -16], [48, 8], [32, 24], [0, 8]], i: [[0, 0], [7, 7], [0, 10], [-7, 7], [0, 0]], o: [[0, 0], [-7, -7], [0, -10], [7, -7], [0, 0]] } } },
    ring: { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [60, 60] } },
    phoenix: { ty: "sh", ks: { a: 0, k: { c: true, v: [[0, -40], [16, -16], [10, 8], [0, 26], [-10, 8], [-16, -16]], i: [[7, 0], [4, 10], [4, 7], [0, 0], [-4, 7], [-4, 10]], o: [[-7, 0], [-4, 10], [-4, 7], [0, 0], [4, 7], [4, 10]] } } }
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
    },
    explosion: {
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [720] }
      ]},
        { t: 0, s: [50, 50, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 20, s: [130, 130, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [100, 100, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100, 100, 100] }
      ]},
        { t: 0, s: [0], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 10, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100] }
      ]}
    },
    ripple: {
        { t: 0, s: [80, 80, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [120, 120, 100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [80, 80, 100] }
      ]},
        { t: 0, s: [100], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 40, s: [50], i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } },
        { t: 80, s: [100] }
      ]}
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

// 50 Premium Animations
export const premiumLevelAnimations: LevelAnimation[] = [
  // ========== BASIC TIER (1-5) ==========
  { id: 'anim_newbie_spark', name: 'Newbie Spark', tier: 'basic', previewColor: '#9CA3AF', effect: 'pulse', animationData: createPremiumAnimation('Newbie Spark', '#9CA3AF', '#6B7280', '#D1D5DB', 'pulse', 'star') },
  { id: 'anim_starter_glow', name: 'Starter Glow', tier: 'basic', previewColor: '#60A5FA', effect: 'glow', animationData: createPremiumAnimation('Starter Glow', '#60A5FA', '#3B82F6', '#BFDBFE', 'glow', 'circle') },
  { id: 'anim_fresh_wave', name: 'Fresh Wave', tier: 'basic', previewColor: '#34D399', effect: 'wave', animationData: createPremiumAnimation('Fresh Wave', '#34D399', '#10B981', '#A7F3D0', 'wave', 'hexagon') },
  { id: 'anim_gentle_heart', name: 'Gentle Heart', tier: 'basic', previewColor: '#F472B6', effect: 'bounce', animationData: createPremiumAnimation('Gentle Heart', '#F472B6', '#EC4899', '#FBCFE8', 'bounce', 'heart') },
  { id: 'anim_soft_shield', name: 'Soft Shield', tier: 'basic', previewColor: '#A78BFA', effect: 'breath', animationData: createPremiumAnimation('Soft Shield', '#A78BFA', '#8B5CF6', '#DDD6FE', 'breath', 'shield') },
  
  // ========== BRONZE TIER (6-10) ==========
  { id: 'anim_bronze_star', name: 'Bronze Star', tier: 'bronze', previewColor: '#CD7F32', effect: 'shimmer', animationData: createPremiumAnimation('Bronze Star', '#CD7F32', '#B8860B', '#DEB887', 'shimmer', 'star') },
  { id: 'anim_copper_crown', name: 'Copper Crown', tier: 'bronze', previewColor: '#B87333', effect: 'glow', animationData: createPremiumAnimation('Copper Crown', '#B87333', '#8B4513', '#D2691E', 'glow', 'crown') },
  { id: 'anim_autumn_flame', name: 'Autumn Flame', tier: 'bronze', previewColor: '#D2691E', effect: 'wave', animationData: createPremiumAnimation('Autumn Flame', '#D2691E', '#A0522D', '#F4A460', 'wave', 'flame') },
  { id: 'anim_earth_medal', name: 'Earth Medal', tier: 'bronze', previewColor: '#8B4513', effect: 'swing', animationData: createPremiumAnimation('Earth Medal', '#8B4513', '#654321', '#A0522D', 'swing', 'medal') },
  { id: 'anim_rustic_diamond', name: 'Rustic Diamond', tier: 'bronze', previewColor: '#C19A6B', effect: 'sparkle', animationData: createPremiumAnimation('Rustic Diamond', '#C19A6B', '#8B4513', '#DEB887', 'sparkle', 'diamond') },
  
  // ========== SILVER TIER (11-20) ==========
  { id: 'anim_silver_star', name: 'Silver Star', tier: 'silver', previewColor: '#C0C0C0', effect: 'sparkle', animationData: createPremiumAnimation('Silver Star', '#C0C0C0', '#A9A9A9', '#E8E8E8', 'sparkle', 'star') },
  { id: 'anim_moonlight_crown', name: 'Moonlight Crown', tier: 'silver', previewColor: '#D3D3D3', effect: 'glow', animationData: createPremiumAnimation('Moonlight Crown', '#D3D3D3', '#B0C4DE', '#F0F8FF', 'glow', 'crown') },
  { id: 'anim_steel_shield', name: 'Steel Shield', tier: 'silver', previewColor: '#708090', effect: 'pulse', animationData: createPremiumAnimation('Steel Shield', '#708090', '#4682B4', '#B0C4DE', 'pulse', 'shield') },
  { id: 'anim_pearl_heart', name: 'Pearl Heart', tier: 'silver', previewColor: '#F0F8FF', effect: 'bounce', animationData: createPremiumAnimation('Pearl Heart', '#F0F8FF', '#B0C4DE', '#FFFFFF', 'bounce', 'heart') },
  { id: 'anim_frost_hex', name: 'Frost Hexagon', tier: 'silver', previewColor: '#B0C4DE', effect: 'float', animationData: createPremiumAnimation('Frost Hexagon', '#B0C4DE', '#87CEEB', '#F0F8FF', 'float', 'hexagon') },
  { id: 'anim_winter_ring', name: 'Winter Ring', tier: 'silver', previewColor: '#87CEEB', effect: 'shimmer', animationData: createPremiumAnimation('Winter Ring', '#87CEEB', '#B0E0E6', '#FFFFFF', 'shimmer', 'ring') },
  
  // ========== GOLD TIER (21-30) ==========
  { id: 'anim_gold_star', name: 'Gold Star', tier: 'gold', previewColor: '#FFD700', effect: 'sparkle', animationData: createPremiumAnimation('Gold Star', '#FFD700', '#FFA500', '#FFEC8B', 'sparkle', 'star') },
  { id: 'anim_royal_crown', name: 'Royal Crown', tier: 'gold', previewColor: '#DAA520', effect: 'glow', animationData: createPremiumAnimation('Royal Crown', '#DAA520', '#B8860B', '#FFD700', 'glow', 'crown') },
  { id: 'anim_sun_shield', name: 'Sun Shield', tier: 'gold', previewColor: '#FFA500', effect: 'pulse', animationData: createPremiumAnimation('Sun Shield', '#FFA500', '#FF8C00', '#FFD700', 'pulse', 'shield') },
  { id: 'anim_amber_diamond', name: 'Amber Diamond', tier: 'gold', previewColor: '#FFBF00', effect: 'shimmer', animationData: createPremiumAnimation('Amber Diamond', '#FFBF00', '#DAA520', '#FFECD2', 'shimmer', 'diamond') },
  { id: 'anim_golden_flame', name: 'Golden Flame', tier: 'gold', previewColor: '#FF8C00', effect: 'wave', animationData: createPremiumAnimation('Golden Flame', '#FF8C00', '#FFA500', '#FFD700', 'wave', 'flame') },
  { id: 'anim_treasure_heart', name: 'Treasure Heart', tier: 'gold', previewColor: '#F0E68C', effect: 'bounce', animationData: createPremiumAnimation('Treasure Heart', '#F0E68C', '#DAA520', '#FAFAD2', 'bounce', 'heart') },
  { id: 'anim_solar_ring', name: 'Solar Ring', tier: 'gold', previewColor: '#FFE4B5', effect: 'spin', animationData: createPremiumAnimation('Solar Ring', '#FFE4B5', '#FFA500', '#FFECD2', 'spin', 'ring') },
  
  // ========== PLATINUM TIER (31-38) ==========
  { id: 'anim_platinum_star', name: 'Platinum Star', tier: 'platinum', previewColor: '#E5E4E2', effect: 'sparkle', animationData: createPremiumAnimation('Platinum Star', '#E5E4E2', '#B0C4DE', '#B9F2FF', 'sparkle', 'star') },
  { id: 'anim_ice_crown', name: 'Ice Crown', tier: 'platinum', previewColor: '#B0E0E6', effect: 'glow', animationData: createPremiumAnimation('Ice Crown', '#B0E0E6', '#87CEEB', '#F0FFFF', 'glow', 'crown') },
  { id: 'anim_crystal_shield', name: 'Crystal Shield', tier: 'platinum', previewColor: '#B9F2FF', effect: 'pulse', animationData: createPremiumAnimation('Crystal Shield', '#B9F2FF', '#87CEFA', '#E0FFFF', 'pulse', 'shield') },
  { id: 'anim_aurora_diamond', name: 'Aurora Diamond', tier: 'platinum', previewColor: '#7FFFD4', effect: 'shimmer', animationData: createPremiumAnimation('Aurora Diamond', '#7FFFD4', '#40E0D0', '#E0FFFF', 'shimmer', 'diamond') },
  { id: 'anim_glacier_heart', name: 'Glacier Heart', tier: 'platinum', previewColor: '#ADD8E6', effect: 'breath', animationData: createPremiumAnimation('Glacier Heart', '#ADD8E6', '#87CEEB', '#F0FFFF', 'breath', 'heart') },
  { id: 'anim_arctic_flame', name: 'Arctic Flame', tier: 'platinum', previewColor: '#00CED1', effect: 'wave', animationData: createPremiumAnimation('Arctic Flame', '#00CED1', '#20B2AA', '#E0FFFF', 'wave', 'flame') },
  { id: 'anim_frozen_ring', name: 'Frozen Ring', tier: 'platinum', previewColor: '#AFEEEE', effect: 'ripple', animationData: createPremiumAnimation('Frozen Ring', '#AFEEEE', '#00CED1', '#F0FFFF', 'ripple', 'ring') },
  { id: 'anim_opal_hex', name: 'Opal Hexagon', tier: 'platinum', previewColor: '#E6E6FA', effect: 'float', animationData: createPremiumAnimation('Opal Hexagon', '#E6E6FA', '#DDA0DD', '#FFF0F5', 'float', 'hexagon') },
  
  // ========== DIAMOND TIER (39-44) ==========
  { id: 'anim_diamond_star', name: 'Diamond Star', tier: 'diamond', previewColor: '#B9F2FF', effect: 'explosion', animationData: createPremiumAnimation('Diamond Star', '#B9F2FF', '#00CED1', '#FFFFFF', 'explosion', 'star') },
  { id: 'anim_sapphire_crown', name: 'Sapphire Crown', tier: 'diamond', previewColor: '#0F52BA', effect: 'glow', animationData: createPremiumAnimation('Sapphire Crown', '#0F52BA', '#000080', '#4169E1', 'glow', 'crown') },
  { id: 'anim_aqua_shield', name: 'Aqua Shield', tier: 'diamond', previewColor: '#00FFFF', effect: 'pulse', animationData: createPremiumAnimation('Aqua Shield', '#00FFFF', '#00CED1', '#E0FFFF', 'pulse', 'shield') },
  { id: 'anim_ocean_diamond', name: 'Ocean Diamond', tier: 'diamond', previewColor: '#1E90FF', effect: 'shimmer', animationData: createPremiumAnimation('Ocean Diamond', '#1E90FF', '#0000CD', '#87CEEB', 'shimmer', 'diamond') },
  { id: 'anim_celestial_heart', name: 'Celestial Heart', tier: 'diamond', previewColor: '#87CEEB', effect: 'sparkle', animationData: createPremiumAnimation('Celestial Heart', '#87CEEB', '#4169E1', '#E0FFFF', 'sparkle', 'heart') },
  { id: 'anim_starlight_wings', name: 'Starlight Wings', tier: 'diamond', previewColor: '#00BFFF', effect: 'float', animationData: createPremiumAnimation('Starlight Wings', '#00BFFF', '#1E90FF', '#E0FFFF', 'float', 'wings') },
  
  // ========== LEGENDARY TIER (45-48) ==========
  { id: 'anim_legendary_phoenix', name: 'Legendary Phoenix', tier: 'legendary', previewColor: '#FF1493', effect: 'explosion', animationData: createPremiumAnimation('Legendary Phoenix', '#FF1493', '#9400D3', '#FF4500', 'explosion', 'phoenix') },
  { id: 'anim_royal_inferno', name: 'Royal Inferno', tier: 'legendary', previewColor: '#FF4500', effect: 'wave', animationData: createPremiumAnimation('Royal Inferno', '#FF4500', '#DC143C', '#FFD700', 'wave', 'flame') },
  { id: 'anim_supreme_crown', name: 'Supreme Crown', tier: 'legendary', previewColor: '#9400D3', effect: 'shimmer', animationData: createPremiumAnimation('Supreme Crown', '#9400D3', '#8B008B', '#FF1493', 'shimmer', 'crown') },
  { id: 'anim_divine_wings', name: 'Divine Wings', tier: 'legendary', previewColor: '#8A2BE2', effect: 'float', animationData: createPremiumAnimation('Divine Wings', '#8A2BE2', '#9400D3', '#DDA0DD', 'float', 'wings') },
  
  // ========== MYTHIC TIER (49-50) ==========
  { id: 'anim_mythic_dragon', name: 'Mythic Dragon', tier: 'mythic', previewColor: '#FF0000', effect: 'explosion', animationData: createPremiumAnimation('Mythic Dragon', '#FF0000', '#8B0000', '#FFD700', 'explosion', 'flame') },
  { id: 'anim_eternal_cosmos', name: 'Eternal Cosmos', tier: 'mythic', previewColor: '#FF69B4', effect: 'ripple', animationData: createPremiumAnimation('Eternal Cosmos', '#FF69B4', '#FF1493', '#FFD700', 'ripple', 'star') }
];

interface AnimationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (animationId: string, animationData: object) => void;
  selectedId?: string | null;
}

export const AnimationPickerModal: React.FC<AnimationPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  selectedId
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [previewAnimation, setPreviewAnimation] = useState<LevelAnimation | null>(null);

  const filteredAnimations = useMemo(() => {
    return premiumLevelAnimations.filter(anim => {
      const matchesSearch = anim.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTier = selectedTier === 'all' || anim.tier === selectedTier;
      return matchesSearch && matchesTier;
    });
  }, [searchQuery, selectedTier]);

  const tiers = ['all', 'basic', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'legendary', 'mythic'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            Premium Animation Library
            <Badge variant="secondary" className="ml-2">50 Animations</Badge>
          </DialogTitle>
          <DialogDescription>
            Select a premium animation for your level badge
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* Search & Filter */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search animations..."
                className="pl-9"
              />
            </div>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              {tiers.map(tier => (
                <option key={tier} value={tier}>
                  {tier === 'all' ? 'All Tiers' : tierLabels[tier]?.en || tier}
                </option>
              ))}
            </select>
          </div>

          {/* Animation Grid */}
          <ScrollArea className="h-[400px]">
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 p-1">
              {filteredAnimations.map((anim) => {
                const tierStyle = tierColors[anim.tier];
                const isSelected = selectedId === anim.id;
                
                return (
                  <motion.button
                    key={anim.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelect(anim.id, anim.animationData)}
                    onMouseEnter={() => setPreviewAnimation(anim)}
                    className={cn(
                      "relative aspect-square rounded-xl border-2 p-2 transition-all",
                      tierStyle.bg,
                      isSelected ? 'border-purple-500 ring-2 ring-purple-500/50' : tierStyle.border,
                      "hover:shadow-lg"
                    )}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <Lottie
                        animationData={anim.animationData}
                        loop
                        autoplay
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>
                    
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    )}
                    
                    <div className={cn(
                      "absolute bottom-0 left-0 right-0 text-[10px] font-medium truncate text-center py-0.5 rounded-b-lg",
                      `bg-gradient-to-r ${tierStyle.gradient}`,
                      "text-white"
                    )}>
                      {anim.name}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </ScrollArea>

          {/* Preview Section */}
          {previewAnimation && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-200/50">
              <div className="w-20 h-20 rounded-xl bg-black/10 flex items-center justify-center">
                <Lottie
                  animationData={previewAnimation.animationData}
                  loop
                  autoplay
                  style={{ width: 70, height: 70 }}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{previewAnimation.name}</h3>
                <div className="flex gap-2 mt-2">
                  <Badge className={`bg-gradient-to-r ${tierColors[previewAnimation.tier].gradient} text-white border-0`}>
                    {tierLabels[previewAnimation.tier]?.en}
                  </Badge>
                  <Badge variant="outline">{previewAnimation.effect}</Badge>
                </div>
              </div>
              <Button
                onClick={() => {
                  onSelect(previewAnimation.id, previewAnimation.animationData);
                  onClose();
                }}
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              >
                <Check className="w-4 h-4 mr-2" />
                Select
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AnimationPickerModal;
