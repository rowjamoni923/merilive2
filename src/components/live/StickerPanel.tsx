/**
 * StickerPanel — Hot-type promo sticker picker.
 * Replaces face-tracked accessory stickers with draggable text promos
 * ("Give Me Gift", "Follow Me", "Tip Me"...). The selected sticker is
 * shown by StickerOverlay as a draggable card with a Close button so
 * the host can dismiss it or move it to the side at any time.
 *
 * No DeepAR — uses our own assets only. Beauty filtering still goes
 * through mediapipeBeautyProcessor (separate panel).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PROMO_STICKERS } from './stickerAssets';

interface StickerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeSticker: string | null;
  onStickerChange: (stickerName: string | null) => void;
}

const CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'all',    label: '🔥 All' },
  { id: 'gift',   label: 'Gift' },
  { id: 'follow', label: 'Follow' },
  { id: 'engage', label: 'Engage' },
  { id: 'hot',    label: 'Hot' },
];

export function StickerPanel({ isOpen, onClose, activeSticker, onStickerChange }: StickerPanelProps) {
  const [category, setCategory] = useState<string>('all');

  const filtered = category === 'all'
    ? PROMO_STICKERS
    : PROMO_STICKERS.filter(s => s.category === category);

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
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-400" />
                <span className="text-white font-semibold text-base">Hot Stickers</span>
                {activeSticker && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-medium">PINNED</span>
                )}
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center" aria-label="Close">
                <X className="w-4 h-4 text-white/70" />
              </button>
            </div>

            <div className="flex gap-2 px-4 pb-3 overflow-x-auto no-scrollbar">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all capitalize',
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
                  className="w-full py-2 rounded-xl bg-red-500/20 text-red-300 text-xs font-medium hover:bg-red-500/30 transition-all"
                >
                  ✕ Remove Sticker
                </button>
              </div>
            )}

            <div className="overflow-y-auto max-h-[40vh] px-4 pb-6">
              <div className="grid grid-cols-2 gap-3">
                {filtered.map((sticker) => {
                  const isActive = activeSticker === sticker.name;
                  return (
                    <button
                      key={sticker.id}
                      onClick={() => onStickerChange(isActive ? null : sticker.name)}
                      className={cn(
                        'relative flex items-center justify-center p-3 rounded-2xl transition-all aspect-[3/2] overflow-hidden',
                        isActive
                          ? 'bg-gradient-to-br from-orange-500/30 to-pink-500/30 border border-orange-400/60 shadow-lg shadow-orange-500/20'
                          : 'bg-white/5 border border-white/10 hover:bg-white/10'
                      )}
                    >
                      <img
                        src={sticker.preview}
                        alt={sticker.name}
                        loading="lazy"
                        className="max-h-full max-w-full object-contain drop-shadow-md"
                      />
                      {isActive && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center shadow">
                          <span className="text-[10px] text-white">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <p className="text-orange-300 text-[10px] text-center">
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
