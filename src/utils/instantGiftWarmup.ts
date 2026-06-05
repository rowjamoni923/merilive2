import { prewarmGiftAssets } from '@/utils/giftAnimationPrewarm';
import { warmupSelectedVapUrls, warmupVapUrls } from '@/utils/vapWarmup';
import { markVapCompositeHint } from '@/utils/vapDetection';

type GiftWarmupPayload = {
  icon_url?: string | null;
  animation_url?: string | null;
  animation_format?: string | null;
  animation_config_url?: string | null;
  sound_url?: string | null;
};

const imageWarmed = new Set<string>();
const MAX_IMAGE_WARMED = 300;

function warmImageNow(url?: string | null) {
  if (!url || typeof window === 'undefined' || imageWarmed.has(url)) return;
  imageWarmed.add(url);
  if (imageWarmed.size > MAX_IMAGE_WARMED) {
    const first = imageWarmed.values().next().value;
    if (first) imageWarmed.delete(first);
  }
  try {
    const img = new Image();
    img.decoding = 'async';
    (img as any).fetchPriority = 'high';
    img.src = url;
  } catch {}
}

export function warmGiftForInstantPlay(gift?: GiftWarmupPayload | null): void {
  if (!gift || typeof window === 'undefined') return;
  const urls = [gift.animation_url, gift.animation_config_url, gift.icon_url, gift.sound_url];
  if (gift.animation_url && String(gift.animation_format || '').toLowerCase() === 'vap') {
    markVapCompositeHint(gift.animation_url, true);
  }
  warmImageNow(gift.icon_url || gift.animation_url || null);
  warmupSelectedVapUrls([gift.animation_url, gift.animation_config_url]);
  warmupVapUrls([gift.sound_url, gift.icon_url], { warmJsonSibling: false, priority: 'high' });
  void prewarmGiftAssets(urls).catch(() => {});
}

export function warmIncomingGiftForInstantPlay(gift?: GiftWarmupPayload | null): void {
  warmGiftForInstantPlay(gift);
}

export function warmGiftUrlsForInstantPlay(urls: Array<string | null | undefined>): void {
  if (typeof window === 'undefined') return;
  urls.forEach(warmImageNow);
  warmupVapUrls(urls, { warmJsonSibling: false });
  void prewarmGiftAssets(urls).catch(() => {});
}