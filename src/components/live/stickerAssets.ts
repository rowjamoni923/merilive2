/**
 * Sticker asset map — premium promo text stickers (own assets, no native beauty).
 * These are draggable promotional overlays the host pins on the stream.
 */
import badGirl from '@/assets/stickers/promo-bad-girl.webp';
import barbieVibes from '@/assets/stickers/promo-barbie-vibes.webp';
import beMine from '@/assets/stickers/promo-be-mine.webp';
import bombshell from '@/assets/stickers/promo-bombshell.webp';
import bossLady from '@/assets/stickers/promo-boss-lady.webp';
import cantResist from '@/assets/stickers/promo-cant-resist.webp';
import cutie from '@/assets/stickers/promo-cutie.webp';
import dateMe from '@/assets/stickers/promo-date-me.webp';
import diva from '@/assets/stickers/promo-diva.webp';
import exclusive from '@/assets/stickers/promo-exclusive.webp';
import fashionIcon from '@/assets/stickers/promo-fashion-icon.webp';
import fireGirl from '@/assets/stickers/promo-fire-girl.webp';
import followMe from '@/assets/stickers/promo-follow-me.webp';
import foreverYours from '@/assets/stickers/promo-forever-yours.webp';
import giveGift from '@/assets/stickers/promo-give-gift.webp';
import glam from '@/assets/stickers/promo-glam.webp';
import hotGirl from '@/assets/stickers/promo-hot-girl.webp';
import hotLive from '@/assets/stickers/promo-hot-live.webp';
import hugMe from '@/assets/stickers/promo-hug-me.webp';
import iLoveYou from '@/assets/stickers/promo-i-love-you.webp';
import joinMe from '@/assets/stickers/promo-join-me.webp';
import kissMe from '@/assets/stickers/promo-kiss-me.webp';
import letsParty from '@/assets/stickers/promo-lets-party.webp';
import likeSub from '@/assets/stickers/promo-like-sub.webp';
import loveYouMore from '@/assets/stickers/promo-love-you-more.webp';
import makeItRain from '@/assets/stickers/promo-make-it-rain.webp';
import missYou from '@/assets/stickers/promo-miss-you.webp';
import mood from '@/assets/stickers/promo-mood.webp';
import myHeart from '@/assets/stickers/promo-my-heart.webp';
import myLove from '@/assets/stickers/promo-my-love.webp';
import naughty from '@/assets/stickers/promo-naughty.webp';
import onlyYou from '@/assets/stickers/promo-only-you.webp';
import premium from '@/assets/stickers/promo-premium.webp';
import queen from '@/assets/stickers/promo-queen.webp';
import sendLove from '@/assets/stickers/promo-send-love.webp';
import sexyVibes from '@/assets/stickers/promo-sexy-vibes.webp';
import shareNow from '@/assets/stickers/promo-share-now.webp';
import showerGifts from '@/assets/stickers/promo-shower-gifts.webp';
import soulmate from '@/assets/stickers/promo-soulmate.webp';
import spicy from '@/assets/stickers/promo-spicy.webp';
import spoilMe from '@/assets/stickers/promo-spoil-me.webp';
import sweetheart from '@/assets/stickers/promo-sweetheart.webp';
import temptation from '@/assets/stickers/promo-temptation.webp';
import tipMe from '@/assets/stickers/promo-tip-me.webp';
import topHost from '@/assets/stickers/promo-top-host.webp';
import treatMe from '@/assets/stickers/promo-treat-me.webp';
import turnUp from '@/assets/stickers/promo-turn-up.webp';
import vibeCheck from '@/assets/stickers/promo-vibe-check.webp';
import vipOnly from '@/assets/stickers/promo-vip-only.webp';
import wildSide from '@/assets/stickers/promo-wild-side.webp';

export type PromoStickerCategory =
  | 'gift'
  | 'follow'
  | 'engage'
  | 'hot'
  | 'romantic'
  | 'premium'
  | 'party';

export interface PromoSticker {
  id: string;
  name: string;
  category: PromoStickerCategory;
  preview: string;
}

export const PROMO_STICKERS: PromoSticker[] = [
  { id: 'promo-give-gift', name: 'Give Me Gift', category: 'gift', preview: giveGift },
  { id: 'promo-tip-me', name: 'Tip Me', category: 'gift', preview: tipMe },
  { id: 'promo-send-love', name: 'Send Love', category: 'gift', preview: sendLove },
  { id: 'promo-shower-gifts', name: 'Shower Gifts', category: 'gift', preview: showerGifts },
  { id: 'promo-spoil-me', name: 'Spoil Me', category: 'gift', preview: spoilMe },
  { id: 'promo-treat-me', name: 'Treat Me', category: 'gift', preview: treatMe },
  { id: 'promo-make-it-rain', name: 'Make It Rain', category: 'gift', preview: makeItRain },

  { id: 'promo-follow-me', name: 'Follow Me', category: 'follow', preview: followMe },
  { id: 'promo-join-me', name: 'Join Me', category: 'follow', preview: joinMe },

  { id: 'promo-like-sub', name: 'Like & Sub', category: 'engage', preview: likeSub },
  { id: 'promo-share-now', name: 'Share Now', category: 'engage', preview: shareNow },
  { id: 'promo-vibe-check', name: 'Vibe Check', category: 'engage', preview: vibeCheck },
  { id: 'promo-mood', name: 'Mood', category: 'engage', preview: mood },

  { id: 'promo-hot-live', name: 'Hot Live', category: 'hot', preview: hotLive },
  { id: 'promo-hot-girl', name: 'Hot Girl', category: 'hot', preview: hotGirl },
  { id: 'promo-queen', name: 'Queen', category: 'hot', preview: queen },
  { id: 'promo-diva', name: 'Diva', category: 'hot', preview: diva },
  { id: 'promo-bad-girl', name: 'Bad Girl', category: 'hot', preview: badGirl },
  { id: 'promo-bombshell', name: 'Bombshell', category: 'hot', preview: bombshell },
  { id: 'promo-boss-lady', name: 'Boss Lady', category: 'hot', preview: bossLady },
  { id: 'promo-glam', name: 'Glam', category: 'hot', preview: glam },
  { id: 'promo-fire-girl', name: 'Fire Girl', category: 'hot', preview: fireGirl },
  { id: 'promo-barbie-vibes', name: 'Barbie Vibes', category: 'hot', preview: barbieVibes },
  { id: 'promo-fashion-icon', name: 'Fashion Icon', category: 'hot', preview: fashionIcon },
  { id: 'promo-spicy', name: 'Spicy', category: 'hot', preview: spicy },
  { id: 'promo-naughty', name: 'Naughty', category: 'hot', preview: naughty },
  { id: 'promo-sexy-vibes', name: 'Sexy Vibes', category: 'hot', preview: sexyVibes },
  { id: 'promo-temptation', name: 'Temptation', category: 'hot', preview: temptation },
  { id: 'promo-wild-side', name: 'Wild Side', category: 'hot', preview: wildSide },

  { id: 'promo-i-love-you', name: 'I Love You', category: 'romantic', preview: iLoveYou },
  { id: 'promo-kiss-me', name: 'Kiss Me', category: 'romantic', preview: kissMe },
  { id: 'promo-be-mine', name: 'Be Mine', category: 'romantic', preview: beMine },
  { id: 'promo-my-heart', name: 'My Heart', category: 'romantic', preview: myHeart },
  { id: 'promo-forever-yours', name: 'Forever Yours', category: 'romantic', preview: foreverYours },
  { id: 'promo-miss-you', name: 'Miss You', category: 'romantic', preview: missYou },
  { id: 'promo-hug-me', name: 'Hug Me', category: 'romantic', preview: hugMe },
  { id: 'promo-sweetheart', name: 'Sweetheart', category: 'romantic', preview: sweetheart },
  { id: 'promo-cutie', name: 'Cutie', category: 'romantic', preview: cutie },
  { id: 'promo-my-love', name: 'My Love', category: 'romantic', preview: myLove },
  { id: 'promo-love-you-more', name: 'Love You More', category: 'romantic', preview: loveYouMore },
  { id: 'promo-soulmate', name: 'Soulmate', category: 'romantic', preview: soulmate },
  { id: 'promo-only-you', name: 'Only You', category: 'romantic', preview: onlyYou },
  { id: 'promo-date-me', name: 'Date Me', category: 'romantic', preview: dateMe },
  { id: 'promo-cant-resist', name: "Can't Resist", category: 'romantic', preview: cantResist },

  { id: 'promo-vip-only', name: 'VIP Only', category: 'premium', preview: vipOnly },
  { id: 'promo-premium', name: 'Premium', category: 'premium', preview: premium },
  { id: 'promo-exclusive', name: 'Exclusive', category: 'premium', preview: exclusive },
  { id: 'promo-top-host', name: 'Top Host', category: 'premium', preview: topHost },

  { id: 'promo-lets-party', name: "Let's Party", category: 'party', preview: letsParty },
  { id: 'promo-turn-up', name: 'Turn Up', category: 'party', preview: turnUp },
];

export const STICKER_ASSET_MAP: Record<string, string> = Object.fromEntries(
  PROMO_STICKERS.map((s) => [s.name, s.preview])
);

export const getStickerAsset = (name: string) => STICKER_ASSET_MAP[name] || null;

/**
 * Animation class per sticker — gives every PNG a GIF-like motion.
 * Categories drive the default; specific names can override for theme accuracy
 * (fire/heart/sparkle/etc.).
 */
const STICKER_ANIM_OVERRIDES: Record<string, string> = {
  'Fire Girl': 'sticker-anim-fire',
  'Hot Live': 'sticker-anim-fire',
  'Hot Girl': 'sticker-anim-fire',
  'Spicy': 'sticker-anim-fire',
  'Temptation': 'sticker-anim-fire',
  'Wild Side': 'sticker-anim-fire',

  'I Love You': 'sticker-anim-heartbeat',
  'Kiss Me': 'sticker-anim-heartbeat',
  'My Heart': 'sticker-anim-heartbeat',
  'Love You More': 'sticker-anim-heartbeat',
  'Be Mine': 'sticker-anim-heartbeat',
  'Forever Yours': 'sticker-anim-heartbeat',
  'Soulmate': 'sticker-anim-heartbeat',
  'Only You': 'sticker-anim-heartbeat',
  "Can't Resist": 'sticker-anim-heartbeat',
  'Sweetheart': 'sticker-anim-heartbeat',
  'My Love': 'sticker-anim-heartbeat',
  'Hug Me': 'sticker-anim-float',
  'Miss You': 'sticker-anim-sway',
  'Cutie': 'sticker-anim-bounce',

  'VIP Only': 'sticker-anim-shine',
  'Premium': 'sticker-anim-shine',
  'Exclusive': 'sticker-anim-shine',
  'Top Host': 'sticker-anim-shine',

  "Let's Party": 'sticker-anim-bounce',
  'Turn Up': 'sticker-anim-bounce',
  'Make It Rain': 'sticker-anim-bounce',
  'Shower Gifts': 'sticker-anim-bounce',
};

const CATEGORY_ANIM: Record<PromoStickerCategory, string> = {
  gift: 'sticker-anim-bounce',
  follow: 'sticker-anim-float',
  engage: 'sticker-anim-float',
  hot: 'sticker-anim-fire',
  romantic: 'sticker-anim-heartbeat',
  premium: 'sticker-anim-shine',
  party: 'sticker-anim-bounce',
};

export function getStickerAnimationClass(name: string): string {
  if (STICKER_ANIM_OVERRIDES[name]) return STICKER_ANIM_OVERRIDES[name];
  const sticker = PROMO_STICKERS.find((s) => s.name === name);
  if (sticker) return CATEGORY_ANIM[sticker.category];
  return 'sticker-anim-float';
}

/** Whether to also apply the diagonal shimmer sweep (premium / hot). */
export function getStickerShimmer(name: string): boolean {
  const sticker = PROMO_STICKERS.find((s) => s.name === name);
  return sticker?.category === 'premium' || sticker?.category === 'hot';
}

/**
 * Warm browser cache + decoder for every sticker PNG so the panel
 * opens with instantly-painted thumbnails (no progressive load).
 * Runs once on idle after first import — zero render cost.
 */
let _warmed = false;
export function warmStickerCache() {
  if (_warmed || typeof window === 'undefined') return;
  _warmed = true;
  // Fire immediately — every PNG goes into the HTTP cache + decoder so the
  // first paint of the panel grid is instant (no progressive load).
  for (const s of PROMO_STICKERS) {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = s.preview;
      if (typeof img.decode === 'function') img.decode().catch(() => {});
    } catch { /* ignore */ }
  }
}

// Auto-warm on module evaluation. The module is statically imported by
// LiveStream / GoLive so warming starts the moment the host enters the live
// page, well before they tap the Sticker button.
warmStickerCache();

