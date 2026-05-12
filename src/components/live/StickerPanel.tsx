/**
 * StickerPanel — premium promo sticker picker.
 * Uses our own premium hot / romantic / gift / party / VIP stickers.
 */
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROMO_STICKERS, type PromoStickerCategory, getStickerAnimationClass } from './stickerAssets';

interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeSticker: string | null;
  onStickerChange: (stickerName: string | null) => void;
}

const CATEGORIES: Array<{ id: 'all' | PromoStickerCategory; label: string }> = [
  { id: 'all', label: '🔥 All' },
  { id: 'hot', label: 'Hot' },
  { id: 'romantic', label: 'Romantic' },
  { id: 'gift', label: 'Gift' },
  { id: 'premium', label: 'Premium' },
  { id: 'party', label: 'Party' },
  { id: 'engage', label: 'Engage' },
  { id: 'follow', label: 'Follow' },
];

export function StickerPanel({ isOpen, onClose, activeSticker, onStickerChange }: StickerPanelProps) {
  const [category, setCategory] = useState<'all' | PromoStickerCategory>('all');

  const filtered = useMemo(() => {
    return category === 'all'
      ? PROMO_STICKERS
      : PROMO_STICKERS.filter((sticker) => sticker.category === category);
  }, [category]);

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
            className="fixed bottom-0 left-0 right-0 z-[60] max-h-[72vh] overflow-hidden rounded-t-3xl bg-black/95 pb-safe backdrop-blur-xl"
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-orange-400" />
                <span className="text-base font-semibold text-white">Premium Stickers</span>
                <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                  {PROMO_STICKERS.length}
                </span>
                {activeSticker && (
                  <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-medium text-orange-300">
                    PINNED
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"
                aria-label="Close"
              >
                <X className="h-4 w-4 text-white/70" />
              </button>
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all capitalize',
                    category === cat.id
                      ? 'bg-gradient-to-r from-orange-500/80 to-pink-500/80 text-white'
                      : 'bg-white/5 text-white/50 hover:bg-white/10'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {activeSticker && (
              <div className="px-4 pb-3">
                <button
                  onClick={() => onStickerChange(null)}
                  className="w-full rounded-xl bg-red-500/20 py-2 text-xs font-medium text-red-300 transition-all hover:bg-red-500/30"
                >
                  ✕ Remove Sticker
                </button>
              </div>
            )}

            <div className="max-h-[48vh] overflow-y-auto px-4 pb-6">
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((sticker) => {
                  const isActive = activeSticker === sticker.name;

                  return (
                    <button
                      key={sticker.id}
                      onClick={() => onStickerChange(isActive ? null : sticker.name)}
                      className={cn(
                        'relative aspect-[3/2] overflow-hidden rounded-2xl border p-3 transition-all',
                        isActive
                          ? 'border-orange-400/60 bg-gradient-to-br from-orange-500/30 to-pink-500/30 shadow-lg shadow-orange-500/20'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                      )}
                    >
                      <img
                        src={sticker.preview}
                        alt={sticker.name}
                        loading="lazy"
                        className={cn('h-full w-full object-contain drop-shadow-md', getStickerAnimationClass(sticker.name))}
                      />
                      {isActive && (
                        <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 shadow">
                          <span className="text-[10px] text-white">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 rounded-xl border border-orange-500/20 bg-orange-500/10 p-2.5">
                <p className="text-center text-[10px] text-orange-300">
                  🔥 Tap to pin on stream — drag to move, ✕ to remove anytime
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default StickerPanel;
