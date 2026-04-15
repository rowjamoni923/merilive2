/**
 * StickerPanel — Standalone sticker selection panel (separate from beauty filters)
 * Shows ONLY accessory stickers (no faces) that overlay on user's face
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

import tiara from '@/assets/stickers/cat-ears.png';
import crown from '@/assets/stickers/crown.png';
import cowboyHat from '@/assets/stickers/bunny-ears.png';
import sunglasses from '@/assets/stickers/sunglasses.png';
import butterfly from '@/assets/stickers/butterfly.png';
import puppy from '@/assets/stickers/puppy.png';
import heartEyes from '@/assets/stickers/heart-eyes.png';
import flowerCrown from '@/assets/stickers/flower-crown.png';
import starGlasses from '@/assets/stickers/sparkle-stars.png';
import foxEars from '@/assets/stickers/fox-ears.png';
import neonFrame from '@/assets/stickers/neon-frame.png';
import angel from '@/assets/stickers/angel.png';

// Local built-in stickers (accessory-only, no faces)
const BUILTIN_STICKERS = [
  { id: 'builtin-1', name: 'Princess Tiara', category: 'headwear', preview: tiara, is_free: true },
  { id: 'builtin-2', name: 'Golden Crown', category: 'headwear', preview: crown, is_free: true },
  { id: 'builtin-3', name: 'Cowboy Hat', category: 'headwear', preview: cowboyHat, is_free: true },
  { id: 'builtin-4', name: 'Cool Sunglasses', category: 'glasses', preview: sunglasses, is_free: true },
  { id: 'builtin-5', name: 'Star Glasses', category: 'glasses', preview: starGlasses, is_free: true },
  { id: 'builtin-6', name: 'Heart Eyes', category: 'glasses', preview: heartEyes, is_free: true },
  { id: 'builtin-7', name: 'Flower Crown', category: 'headwear', preview: flowerCrown, is_free: true },
  { id: 'builtin-8', name: 'Angel Halo', category: 'headwear', preview: angel, is_free: true },
  { id: 'builtin-9', name: 'Fox Ears', category: 'headwear', preview: foxEars, is_free: true },
  { id: 'builtin-10', name: 'Cute Puppy', category: 'face', preview: puppy, is_free: true },
  { id: 'builtin-11', name: 'Butterfly Wings', category: 'effects', preview: butterfly, is_free: true },
  { id: 'builtin-12', name: 'Neon Frame', category: 'effects', preview: neonFrame, is_free: true },
];

interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeSticker: string | null;
  onStickerChange: (stickerName: string | null) => void;
}

export function StickerPanel({ isOpen, onClose, activeSticker, onStickerChange }: StickerPanelProps) {
  const [category, setCategory] = useState<string>('all');

  const categories = ['all', 'headwear', 'glasses', 'face', 'effects'];
  const filtered = category === 'all' ? BUILTIN_STICKERS : BUILTIN_STICKERS.filter(s => s.category === category);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[55]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className="fixed bottom-0 left-0 right-0 z-[60] bg-black/95 backdrop-blur-xl rounded-t-3xl pb-safe max-h-[65vh] overflow-hidden"
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <Smile className="w-5 h-5 text-amber-400" />
                <span className="text-white font-semibold text-base">Face Stickers</span>
                {activeSticker && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-medium">🎭 ON</span>
                )}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            {/* Category pills */}
            <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize',
                    category === cat
                      ? 'bg-gradient-to-r from-amber-500/80 to-orange-500/80 text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/10'
                  )}
                >
                  {cat === 'all' ? '✨ All' : cat}
                </button>
              ))}
            </div>

            {/* Remove sticker */}
            {activeSticker && (
              <div className="px-4 pb-3">
                <button
                  onClick={() => onStickerChange(null)}
                  className="w-full py-2 rounded-xl bg-red-500/20 text-red-300 text-xs font-medium hover:bg-red-500/30 transition-all"
                >
                  ✕ Remove Sticker
                </button>
              </div>
            )}

            {/* Sticker grid */}
            <div className="overflow-y-auto max-h-[40vh] px-4 pb-6">
              <div className="grid grid-cols-4 gap-3">
                {filtered.map((sticker) => {
                  const isActive = activeSticker === sticker.name;
                  return (
                    <button
                      key={sticker.id}
                      onClick={() => onStickerChange(isActive ? null : sticker.name)}
                      className={cn(
                        'relative flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all',
                        isActive
                          ? 'bg-gradient-to-br from-amber-500/30 to-orange-500/30 border border-amber-400/50 shadow-lg shadow-amber-500/20'
                          : 'bg-white/5 border border-white/5 hover:bg-white/10'
                      )}
                    >
                      <div className="w-14 h-14 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center">
                        <img src={sticker.preview} alt={sticker.name} className="w-12 h-12 object-contain" loading="lazy" />
                      </div>
                      <span className={cn('text-[10px] font-medium truncate w-full text-center', isActive ? 'text-amber-300' : 'text-white/50')}>
                        {sticker.name}
                      </span>
                      {isActive && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                          <span className="text-[8px] text-white">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-amber-300 text-[10px] text-center">🎭 Face-tracked stickers — accessories adjust to your face automatically</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default StickerPanel;
