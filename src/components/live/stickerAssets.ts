/**
 * Sticker asset map — separated from StickerOverlay to avoid breaking Fast Refresh
 */
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

export const STICKER_ASSET_MAP: Record<string, string> = {
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

export const getStickerAsset = (name: string) => STICKER_ASSET_MAP[name] || null;
