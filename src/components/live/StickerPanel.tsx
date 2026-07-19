/**
 * StickerPanel — premium promo sticker picker.
 * Uses our own premium hot / romantic / gift / party / VIP stickers.
 */
import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame, Sparkles } from 'lucide-react';
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
            className="fixed inset-0 z-[55] bg-black/60"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-[60] max-h-[72dvh] overflow-hidden rounded-t-3xl border-t border-white/10 pb-safe",
              "md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[600px] md:rounded-3xl md:bottom-10 md:border md:shadow-2xl"
            )}
            style={{
              background:
                'radial-gradient(120% 80% at 50% 0%, rgba(249,115,22,0.18), transparent 55%), radial-gradient(120% 80% at 50% 100%, rgba(236,72,153,0.16), transparent 60%), linear-gradient(180deg, #1a1226 0%, #100a1a 60%, #06040c 100%)',
              boxShadow:
                '0 -18px 60px -10px rgba(249,115,22,0.35), 0 -4px 24px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex justify-center pt-3 pb-1">
              <div className="h-1.5 w-12 rounded-full bg-gradient-to-r from-transparent via-white/50 to-transparent" />
            </div>

            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-2xl bg-gradient-to-br from-orange-400 via-pink-500 to-fuchsia-600 flex items-center justify-center"
                  style={{
                    boxShadow:
                      '0 8px 18px -6px rgba(249,115,22,0.6), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.25)',
                  }}
                >
                  <Flame className="h-4 w-4 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }} />
                </div>
                <div className="flex flex-col leading-tight">
                  <span
                    className="text-sm font-extrabold text-white tracking-wide"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                  >
                    Premium Stickers
                  </span>
                  <span className="text-[10px] text-white/65 font-medium">
                    {PROMO_STICKERS.length} curated · tap to pin
                  </span>
                </div>
                {activeSticker && (
                  <span
                    className="ml-1 rounded-full bg-gradient-to-r from-orange-500 to-pink-500 px-2 py-0.5 text-[9px] font-bold text-white border border-white/30"
                    style={{ boxShadow: '0 4px 10px -4px rgba(249,115,22,0.55), inset 0 1px 0 rgba(255,255,255,0.4)' }}
                  >
                    PINNED
                  </span>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15 hover:-translate-y-0.5 transition-all"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 10px -4px rgba(0,0,0,0.5)' }}
                aria-label="Close"
              >
                <X className="h-4 w-4 text-white/80" />
              </button>
            </div>

            <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
              {CATEGORIES.map((cat) => {
                const isActive = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setCategory(cat.id)}
                    className={cn(
                      'shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all capitalize border',
                      isActive
                        ? 'bg-gradient-to-r from-orange-500 via-pink-500 to-fuchsia-500 text-white border-white/30 -translate-y-0.5'
                        : 'bg-white/[0.06] text-white/70 border-white/10 hover:bg-white/10 hover:-translate-y-0.5'
                    )}
                    style={{
                      boxShadow: isActive
                        ? '0 6px 16px -4px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.4)'
                        : 'inset 0 1px 0 rgba(255,255,255,0.06)',
                      textShadow: isActive ? '0 1px 2px rgba(0,0,0,0.35)' : undefined,
                    }}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>

            {activeSticker && (
              <div className="px-4 pb-3">
                <button
                  onClick={() => onStickerChange(null)}
                  className="w-full rounded-2xl py-2.5 text-xs font-bold text-white border border-red-300/40 transition-all hover:-translate-y-0.5 active:translate-y-0"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(239,68,68,0.35) 0%, rgba(190,24,93,0.35) 100%)',
                    boxShadow:
                      '0 8px 18px -6px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                  }}
                >
                  ✕ Remove Pinned Sticker
                </button>
              </div>
            )}

            <div className="max-h-[48dvh] overflow-y-auto px-4 pb-6">
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
                          ? 'border-orange-300/70 -translate-y-0.5'
                          : 'border-white/10 hover:-translate-y-0.5 hover:border-white/20'
                      )}
                      style={{
                        background: isActive
                          ? 'radial-gradient(120% 100% at 50% 0%, rgba(249,115,22,0.35), transparent 60%), linear-gradient(180deg, rgba(236,72,153,0.25), rgba(168,85,247,0.18))'
                          : 'linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))',
                        boxShadow: isActive
                          ? '0 10px 24px -8px rgba(249,115,22,0.55), inset 0 1px 0 rgba(255,255,255,0.18)'
                          : 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 10px -6px rgba(0,0,0,0.5)',
                      }}
                    >
                      <img
                        src={sticker.preview}
                        alt={sticker.name}
                        loading="eager"
                        decoding="sync"
                        {...({ fetchpriority: "high" } as React.ImgHTMLAttributes<HTMLImageElement>)}
                        draggable={false}
                        className={cn('h-full w-full object-contain drop-shadow-md', getStickerAnimationClass(sticker.name))}
                      />

                      {isActive && (
                        <div
                          className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 border border-white/40"
                          style={{ boxShadow: '0 4px 10px -4px rgba(249,115,22,0.6), inset 0 1px 0 rgba(255,255,255,0.45)' }}
                        >
                          <span className="text-[10px] text-white font-black">✓</span>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              <div
                className="mt-4 rounded-2xl border border-orange-300/30 p-3 flex items-center gap-2"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(249,115,22,0.18) 0%, rgba(236,72,153,0.14) 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
                }}
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-300 flex-shrink-0" />
                <p className="text-[10px] text-orange-100/90 font-medium">
                  Tap to pin on stream — drag to reposition, ✕ to remove anytime.
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
