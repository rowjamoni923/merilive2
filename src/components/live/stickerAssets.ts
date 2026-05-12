/**
 * Sticker asset map — premium promo text stickers (own assets, no DeepAR).
 * These are draggable promotional overlays the host pins on the stream.
 */
import badGirl from '@/assets/stickers/promo-bad-girl.png';
import barbieVibes from '@/assets/stickers/promo-barbie-vibes.png';
import beMine from '@/assets/stickers/promo-be-mine.png';
import bombshell from '@/assets/stickers/promo-bombshell.png';
import bossLady from '@/assets/stickers/promo-boss-lady.png';
import cantResist from '@/assets/stickers/promo-cant-resist.png';
import cutie from '@/assets/stickers/promo-cutie.png';
import dateMe from '@/assets/stickers/promo-date-me.png';
import diva from '@/assets/stickers/promo-diva.png';
import exclusive from '@/assets/stickers/promo-exclusive.png';
import fashionIcon from '@/assets/stickers/promo-fashion-icon.png';
import fireGirl from '@/assets/stickers/promo-fire-girl.png';
import followMe from '@/assets/stickers/promo-follow-me.png';
import foreverYours from '@/assets/stickers/promo-forever-yours.png';
import giveGift from '@/assets/stickers/promo-give-gift.png';
import glam from '@/assets/stickers/promo-glam.png';
import hotGirl from '@/assets/stickers/promo-hot-girl.png';
import hotLive from '@/assets/stickers/promo-hot-live.png';
import hugMe from '@/assets/stickers/promo-hug-me.png';
import iLoveYou from '@/assets/stickers/promo-i-love-you.png';
import joinMe from '@/assets/stickers/promo-join-me.png';
import kissMe from '@/assets/stickers/promo-kiss-me.png';
import letsParty from '@/assets/stickers/promo-lets-party.png';
import likeSub from '@/assets/stickers/promo-like-sub.png';
import loveYouMore from '@/assets/stickers/promo-love-you-more.png';
import makeItRain from '@/assets/stickers/promo-make-it-rain.png';
import missYou from '@/assets/stickers/promo-miss-you.png';
import mood from '@/assets/stickers/promo-mood.png';
import myHeart from '@/assets/stickers/promo-my-heart.png';
import myLove from '@/assets/stickers/promo-my-love.png';
import naughty from '@/assets/stickers/promo-naughty.png';
import onlyYou from '@/assets/stickers/promo-only-you.png';
import premium from '@/assets/stickers/promo-premium.png';
import queen from '@/assets/stickers/promo-queen.png';
import sendLove from '@/assets/stickers/promo-send-love.png';
import sexyVibes from '@/assets/stickers/promo-sexy-vibes.png';
import shareNow from '@/assets/stickers/promo-share-now.png';
import showerGifts from '@/assets/stickers/promo-shower-gifts.png';
import soulmate from '@/assets/stickers/promo-soulmate.png';
import spicy from '@/assets/stickers/promo-spicy.png';
import spoilMe from '@/assets/stickers/promo-spoil-me.png';
import sweetheart from '@/assets/stickers/promo-sweetheart.png';
import temptation from '@/assets/stickers/promo-temptation.png';
import tipMe from '@/assets/stickers/promo-tip-me.png';
import topHost from '@/assets/stickers/promo-top-host.png';
import treatMe from '@/assets/stickers/promo-treat-me.png';
import turnUp from '@/assets/stickers/promo-turn-up.png';
import vibeCheck from '@/assets/stickers/promo-vibe-check.png';
import vipOnly from '@/assets/stickers/promo-vip-only.png';
import wildSide from '@/assets/stickers/promo-wild-side.png';

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
