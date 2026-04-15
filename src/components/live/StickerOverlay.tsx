/**
 * StickerOverlay — Face-tracked sticker rendering using MediaPipe landmarks
 * Stickers position themselves ON the detected face, not just floating
 */
import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLastFaceBounds } from '@/services/mediapipeBeautyProcessor';

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

const STICKER_ASSET_MAP: Record<string, string> = {
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

// Each sticker has an anchor relative to face bounding box
// yOffset: fraction of face height above top (negative = above face)
// scale: how wide relative to face width
interface StickerPlacement {
  yOffset: number; // relative to face top (negative = above)
  scale: number;   // width as fraction of face width
}

const STICKER_PLACEMENT: Record<string, StickerPlacement> = {
  'Cat Ears':        { yOffset: -0.55, scale: 1.3 },
  'Golden Crown':    { yOffset: -0.65, scale: 1.2 },
  'Bunny Ears':      { yOffset: -0.6, scale: 1.1 },
  'Cool Sunglasses': { yOffset: 0.2, scale: 1.1 },
  'Butterfly Wings': { yOffset: -0.3, scale: 1.6 },
  'Cute Puppy':      { yOffset: 0.3, scale: 1.0 },
  'Heart Eyes':      { yOffset: 0.15, scale: 0.9 },
  'Flower Crown':    { yOffset: -0.5, scale: 1.4 },
  'Sparkle Stars':   { yOffset: -0.2, scale: 1.2 },
  'Fox Ears':        { yOffset: -0.5, scale: 1.2 },
  'Neon Frame':      { yOffset: -0.15, scale: 1.6 },
  'Angel Halo':      { yOffset: -0.7, scale: 0.9 },
};

interface StickerOverlayProps {
  stickerName: string | null;
  className?: string;
}

export const StickerOverlay = memo(({ stickerName, className = '' }: StickerOverlayProps) => {
  const [faceBounds, setFaceBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  // Poll face bounds from MediaPipe at ~30fps
  useEffect(() => {
    if (!stickerName) return;
    let running = true;
    const poll = () => {
      if (!running) return;
      const bounds = getLastFaceBounds();
      setFaceBounds(bounds);
      requestAnimationFrame(poll);
    };
    poll();
    return () => { running = false; };
  }, [stickerName]);

  if (!stickerName) return null;

  const asset = STICKER_ASSET_MAP[stickerName];
  if (!asset) return null;

  const placement = STICKER_PLACEMENT[stickerName] || { yOffset: -0.3, scale: 1.2 };

  // If face is detected, position relative to face
  if (faceBounds) {
    const faceCenterX = (faceBounds.x + faceBounds.width / 2) * 100;
    const faceTopY = faceBounds.y * 100;
    const faceW = faceBounds.width * 100;
    const faceH = faceBounds.height * 100;
    const stickerW = faceW * placement.scale;
    const stickerLeft = faceCenterX - stickerW / 2;
    const stickerTop = faceTopY + faceH * placement.yOffset;

    return (
      <div className={`absolute inset-0 pointer-events-none z-[15] overflow-hidden ${className}`}>
        <motion.img
          key={stickerName}
          src={asset}
          alt={stickerName}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute object-contain drop-shadow-lg"
          style={{
            left: `${stickerLeft}%`,
            top: `${stickerTop}%`,
            width: `${stickerW}%`,
            transform: 'scaleX(-1)', // Mirror for front camera
          }}
          draggable={false}
        />
      </div>
    );
  }

  // Fallback: center overlay when no face detected
  return (
    <AnimatePresence>
      <motion.div
        key={stickerName}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className={`absolute inset-0 pointer-events-none z-[15] flex items-center justify-center ${className}`}
      >
        <img
          src={asset}
          alt={stickerName}
          className="object-contain drop-shadow-lg w-[60%] max-h-[50%]"
          draggable={false}
        />
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <span className="text-[10px] text-white/40 bg-black/40 px-2 py-1 rounded-full">
            👆 Face not detected — show your face
          </span>
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

StickerOverlay.displayName = 'StickerOverlay';

export const getStickerAsset = (name: string) => STICKER_ASSET_MAP[name] || null;

export default StickerOverlay;
