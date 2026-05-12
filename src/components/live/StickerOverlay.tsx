/**
 * StickerOverlay — Draggable hot-type promo sticker pinned over the stream.
 *
 * Hosts pin a promo text sticker (Give Me Gift, Follow Me, Tip Me, …) and
 * can:
 *   • Drag it anywhere on the broadcast canvas
 *   • Tap the ✕ button to remove it (or push it aside)
 *
 * Not face-tracked — these are pure overlay graphics. Beauty filters and
 * face stickers are NOT part of this component (own beauty pipeline runs
 * separately via mediapipeBeautyProcessor).
 */
import { memo, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { STICKER_ASSET_MAP, getStickerAnimationClass, getStickerShimmer } from './stickerAssets';

interface StickerOverlayProps {
  stickerName: string | null;
  /** Optional: called when host taps the ✕ to dismiss the sticker. */
  onDismiss?: () => void;
  className?: string;
}

const StickerOverlay = memo(({ stickerName, onDismiss, className = '' }: StickerOverlayProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Initial position: top-center, slightly down.
  const [pos, setPos] = useState({ xPct: 0.5, yPct: 0.18 });

  // Reset position when sticker changes so a fresh sticker lands in a known spot.
  useEffect(() => {
    setPos({ xPct: 0.5, yPct: 0.18 });
  }, [stickerName]);

  if (!stickerName) return null;
  const asset = STICKER_ASSET_MAP[stickerName];
  if (!asset) return null;

  const onDrag = (_: unknown, info: { point: { x: number; y: number } }) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const xPct = Math.max(0.05, Math.min(0.95, (info.point.x - rect.left) / rect.width));
    const yPct = Math.max(0.05, Math.min(0.92, (info.point.y - rect.top) / rect.height));
    setPos({ xPct, yPct });
  };

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 z-[15] overflow-hidden pointer-events-none ${className}`}
    >
      <AnimatePresence>
        <motion.div
          key={stickerName}
          drag
          dragMomentum={false}
          dragElastic={0}
          onDrag={onDrag}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', damping: 22, stiffness: 320 }}
          className="absolute pointer-events-auto cursor-grab active:cursor-grabbing select-none"
          style={{
            left: `${pos.xPct * 100}%`,
            top: `${pos.yPct * 100}%`,
            transform: 'translate(-50%, -50%)',
            touchAction: 'none',
            width: '46%',
            maxWidth: 240,
          }}
        >
          <div className={`relative ${getStickerShimmer(stickerName) ? 'sticker-shimmer-wrap' : ''}`}>
            <img
              src={asset}
              alt={stickerName}
              draggable={false}
              className={`w-full h-auto object-contain drop-shadow-[0_4px_14px_rgba(0,0,0,0.45)] pointer-events-none ${getStickerAnimationClass(stickerName)}`}
            />
            {onDismiss && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                aria-label="Remove sticker"
                className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-black/80 border border-white/30 flex items-center justify-center shadow-lg hover:bg-black active:scale-95 transition"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
});

StickerOverlay.displayName = 'StickerOverlay';

export default StickerOverlay;
