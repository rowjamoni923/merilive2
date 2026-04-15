/**
 * StickerOverlay — Renders selected sticker as a face overlay on video
 * Works on both web and native (CSS overlay approach)
 */
import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Import all sticker assets
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

// Map sticker names to local assets
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

// Positioning configs for each sticker type
const STICKER_POSITION: Record<string, { top: string; width: string; transform?: string }> = {
  'Cat Ears': { top: '-5%', width: '70%' },
  'Golden Crown': { top: '-15%', width: '65%' },
  'Bunny Ears': { top: '-10%', width: '60%' },
  'Cool Sunglasses': { top: '20%', width: '65%' },
  'Butterfly Wings': { top: '5%', width: '90%' },
  'Cute Puppy': { top: '25%', width: '60%' },
  'Heart Eyes': { top: '20%', width: '55%' },
  'Flower Crown': { top: '-10%', width: '75%' },
  'Sparkle Stars': { top: '5%', width: '60%' },
  'Fox Ears': { top: '-5%', width: '60%' },
  'Neon Frame': { top: '0%', width: '100%' },
  'Angel Halo': { top: '-20%', width: '50%' },
};

interface StickerOverlayProps {
  stickerName: string | null;
  className?: string;
}

export const StickerOverlay = memo(({ stickerName, className = '' }: StickerOverlayProps) => {
  if (!stickerName) return null;

  const asset = STICKER_ASSET_MAP[stickerName];
  if (!asset) return null;

  const pos = STICKER_POSITION[stickerName] || { top: '0%', width: '60%' };

  return (
    <AnimatePresence>
      <motion.div
        key={stickerName}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.5 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className={`absolute inset-0 pointer-events-none z-[15] flex items-start justify-center ${className}`}
        style={{ top: pos.top }}
      >
        <img
          src={asset}
          alt={stickerName}
          className="object-contain drop-shadow-lg"
          style={{ width: pos.width, maxHeight: '80%' }}
          draggable={false}
        />
      </motion.div>
    </AnimatePresence>
  );
});

StickerOverlay.displayName = 'StickerOverlay';

export const getStickerAsset = (name: string) => STICKER_ASSET_MAP[name] || null;

export default StickerOverlay;
