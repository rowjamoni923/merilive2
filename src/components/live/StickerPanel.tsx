/**
 * StickerPanel — Standalone sticker selection panel (separate from beauty filters)
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smile } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

import catEars from '@/assets/stickers/cat-ears.png';
import crown from '@/assets/stickers/crown.png';
import bunnyEars from '@/assets/stickers/bunny-ears.png';
import sunglasses from '@/assets/stickers/sunglasses.png';
import butterfly from '@/assets/stickers/butterfly.png';
import puppy from '@/assets/stickers/puppy.png';
import heartEyes from '@/assets/stickers/heart-eyes.png';
import flowerCrown from '@/assets/stickers/flower-crown.png';
import sparkleStars from '@/assets/stickers/sparkle-stars.png';
import foxEars from '@/assets/stickers/fox-ears.png';
import neonFrame from '@/assets/stickers/neon-frame.png';
import angel from '@/assets/stickers/angel.png';

const STICKER_PREVIEW_MAP: Record<string, string> = {
  'Cat Ears': catEars,
  'Golden Crown': crown,
  'Bunny Ears': bunnyEars,
  'Cool Sunglasses': sunglasses,
  'Butterfly Wings': butterfly,
  'Cute Puppy': puppy,
  'Heart Eyes': heartEyes,
  'Flower Crown': flowerCrown,
  'Sparkle Stars': sparkleStars,
  'Fox Ears': foxEars,
  'Neon Frame': neonFrame,
  'Angel Halo': angel,
};

interface StickerItem {
  id: string;
  name: string;
  category: string;
  preview_url: string;
  is_free: boolean;
}

interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeSticker: string | null;
  onStickerChange: (stickerName: string | null) => void;
}

export function StickerPanel({ isOpen, onClose, activeSticker, onStickerChange }: StickerPanelProps) {
  const [stickers, setStickers] = useState<StickerItem[]>([]);
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    if (!isOpen) return;
    const load = async () => {
      const { data } = await supabase
        .from('ar_stickers' as any)
        .select('id, name, category, preview_url, is_free')
        .eq('is_active', true)
        .order('display_order');
      if (data) setStickers(data as any);
    };
    load();
  }, [isOpen]);

  const categories = ['all', ...new Set(stickers.map(s => s.category))];
  const filtered = category === 'all' ? stickers : stickers.filter(s => s.category === category);

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
                  {cat}
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
                  const previewSrc = STICKER_PREVIEW_MAP[sticker.name] || sticker.preview_url;
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
                        <img src={previewSrc} alt={sticker.name} className="w-12 h-12 object-contain" loading="lazy" />
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

              {stickers.length === 0 && (
                <div className="text-center py-8">
                  <Smile className="w-10 h-10 text-white/20 mx-auto mb-2" />
                  <p className="text-white/30 text-xs">Loading stickers...</p>
                </div>
              )}

              <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-amber-300 text-[10px] text-center">🎭 Face-tracked AI Stickers — Detects your face automatically</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default StickerPanel;
