/**
 * StickerOverlay — Face-tracked sticker rendering using MediaPipe landmarks
 * Stickers are ONLY accessories (no faces) that overlay on the user's real face
 */
import { memo, useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLastFaceBounds } from '@/services/mediapipeBeautyProcessor';

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

const STICKER_ASSET_MAP: Record<string, string> = {
  'Princess Tiara': tiara,
  'Golden Crown': crown,
  'Cowboy Hat': cowboyHat,
  'Cool Sunglasses': sunglasses,
  'Butterfly Wings': butterfly,
  'Cute Puppy': puppy,
  'Heart Eyes': heartEyes,
  'Flower Crown': flowerCrown,
  'Star Glasses': starGlasses,
  'Fox Ears': foxEars,
  'Neon Frame': neonFrame,
  'Angel Halo': angel,
};

/**
 * Sticker placement anchored to face landmarks:
 * - anchor: 'top' = above head, 'eyes' = eye level, 'face' = full face, 'around' = around face
 * - yOffset: fraction of faceHeight from anchor point (negative = higher)
 * - scale: width relative to face width
 */
interface StickerPlacement {
  anchor: 'top' | 'eyes' | 'face' | 'around';
  yOffset: number;
  scale: number;
}

const STICKER_PLACEMENT: Record<string, StickerPlacement> = {
  'Princess Tiara':  { anchor: 'top', yOffset: -0.45, scale: 1.1 },
  'Golden Crown':    { anchor: 'top', yOffset: -0.6, scale: 1.15 },
  'Cowboy Hat':      { anchor: 'top', yOffset: -0.7, scale: 1.4 },
  'Cool Sunglasses': { anchor: 'eyes', yOffset: 0.0, scale: 1.05 },
  'Butterfly Wings': { anchor: 'around', yOffset: -0.1, scale: 2.0 },
  'Cute Puppy':      { anchor: 'face', yOffset: 0.05, scale: 1.0 },
  'Heart Eyes':      { anchor: 'eyes', yOffset: -0.05, scale: 0.7 },
  'Flower Crown':    { anchor: 'top', yOffset: -0.35, scale: 1.3 },
  'Star Glasses':    { anchor: 'eyes', yOffset: 0.0, scale: 1.05 },
  'Fox Ears':        { anchor: 'top', yOffset: -0.55, scale: 1.15 },
  'Neon Frame':      { anchor: 'around', yOffset: -0.1, scale: 1.5 },
  'Angel Halo':      { anchor: 'top', yOffset: -0.65, scale: 0.85 },
};

interface StickerOverlayProps {
  stickerName: string | null;
  className?: string;
}

export const StickerOverlay = memo(({ stickerName, className = '' }: StickerOverlayProps) => {
  const [faceBounds, setFaceBounds] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number>(0);

  // Poll face bounds from MediaPipe at ~30fps
  useEffect(() => {
    if (!stickerName) return;
    let running = true;
    const poll = () => {
      if (!running) return;
      const bounds = getLastFaceBounds();
      setFaceBounds(bounds);
      rafRef.current = requestAnimationFrame(poll);
    };
    poll();
    return () => { 
      running = false; 
      cancelAnimationFrame(rafRef.current);
    };
  }, [stickerName]);

  if (!stickerName) return null;

  const asset = STICKER_ASSET_MAP[stickerName];
  if (!asset) return null;

  const placement = STICKER_PLACEMENT[stickerName] || { anchor: 'top', yOffset: -0.3, scale: 1.2 };

  // If face is detected, position relative to face
  if (faceBounds) {
    const faceX = faceBounds.x * 100;
    const faceY = faceBounds.y * 100;
    const faceW = faceBounds.width * 100;
    const faceH = faceBounds.height * 100;
    const faceCenterX = faceX + faceW / 2;
    const eyeY = faceY + faceH * 0.35; // approximate eye line

    const stickerW = faceW * placement.scale;
    const stickerLeft = faceCenterX - stickerW / 2;

    let stickerTop: number;
    switch (placement.anchor) {
      case 'eyes':
        stickerTop = eyeY + faceH * placement.yOffset;
        break;
      case 'face':
        stickerTop = faceY + faceH * placement.yOffset;
        break;
      case 'around':
        stickerTop = faceY + faceH * placement.yOffset;
        break;
      case 'top':
      default:
        stickerTop = faceY + faceH * placement.yOffset;
        break;
    }

    return (
      <div className={`absolute inset-0 pointer-events-none z-[15] overflow-hidden ${className}`}>
        <motion.img
          key={stickerName}
          src={asset}
          alt={stickerName}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="absolute object-contain"
          style={{
            left: `${stickerLeft}%`,
            top: `${stickerTop}%`,
            width: `${stickerW}%`,
            transform: 'scaleX(-1)', // Mirror for front camera
            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
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
          className="object-contain drop-shadow-lg w-[50%] max-h-[40%]"
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
