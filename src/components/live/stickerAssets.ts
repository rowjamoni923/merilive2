/**
 * Sticker asset map — Hot-type promo text stickers (own assets, no DeepAR).
 * These are draggable promotional overlays the host pins on the stream.
 */
import giveGift from '@/assets/stickers/promo-give-gift.png';
import followMe from '@/assets/stickers/promo-follow-me.png';
import sendLove from '@/assets/stickers/promo-send-love.png';
import tipMe from '@/assets/stickers/promo-tip-me.png';
import shareNow from '@/assets/stickers/promo-share-now.png';
import joinMe from '@/assets/stickers/promo-join-me.png';
import hotLive from '@/assets/stickers/promo-hot-live.png';
import likeSub from '@/assets/stickers/promo-like-sub.png';

export interface PromoSticker {
  id: string;
  name: string;
  category: 'gift' | 'follow' | 'engage' | 'hot';
  preview: string;
}

export const PROMO_STICKERS: PromoSticker[] = [
  { id: 'promo-give-gift',  name: 'Give Me Gift', category: 'gift',   preview: giveGift },
  { id: 'promo-tip-me',     name: 'Tip Me',       category: 'gift',   preview: tipMe },
  { id: 'promo-send-love',  name: 'Send Love',    category: 'gift',   preview: sendLove },
  { id: 'promo-follow-me',  name: 'Follow Me',    category: 'follow', preview: followMe },
  { id: 'promo-join-me',    name: 'Join Me',      category: 'follow', preview: joinMe },
  { id: 'promo-like-sub',   name: 'Like & Sub',   category: 'engage', preview: likeSub },
  { id: 'promo-share-now',  name: 'Share Now',    category: 'engage', preview: shareNow },
  { id: 'promo-hot-live',   name: 'Hot Live',     category: 'hot',    preview: hotLive },
];

export const STICKER_ASSET_MAP: Record<string, string> = Object.fromEntries(
  PROMO_STICKERS.map(s => [s.name, s.preview])
);

export const getStickerAsset = (name: string) => STICKER_ASSET_MAP[name] || null;
