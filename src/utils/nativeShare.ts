/**
 * Pillar 4 — Native share sheet helper.
 *
 * Order of preference:
 *   1. @capacitor/share (real Android/iOS system share sheet)
 *   2. navigator.share (Web Share API on supported browsers / PWA)
 *   3. Clipboard fallback (writes the URL/text, returns 'clipboard')
 *
 * Always resolves — never throws. Returns the channel used so callers
 * can show an appropriate toast ("Shared" vs "Link copied").
 *
 * Triggers a medium haptic on success (key-action feel).
 */
import { tapMedium } from '@/utils/haptics';
import { isNativeApp } from '@/utils/nativeUtils';

export type ShareChannel = 'native' | 'web' | 'clipboard' | 'unavailable';

export interface ShareInput {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export async function nativeShare(input: ShareInput): Promise<ShareChannel> {
  const payload = {
    title: input.title,
    text: input.text,
    url: input.url,
    dialogTitle: input.dialogTitle ?? input.title ?? 'Share',
  };

  // 1) Native Capacitor share sheet
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share');
      const can = await Share.canShare().catch(() => ({ value: true }));
      if (can?.value !== false) {
        await Share.share(payload);
        tapMedium();
        return 'native';
      }
    } catch {
      /* fall through to web */
    }
  }

  // 2) Web Share API
  try {
    const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
    if (nav?.share) {
      await nav.share({ title: payload.title, text: payload.text, url: payload.url });
      tapMedium();
      return 'web';
    }
  } catch {
    /* user cancelled or unsupported — fall through */
  }

  // 3) Clipboard fallback
  try {
    const blob = [payload.title, payload.text, payload.url].filter(Boolean).join('\n');
    if (blob && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(blob);
      tapMedium();
      return 'clipboard';
    }
  } catch {
    /* ignore */
  }

  return 'unavailable';
}

export default nativeShare;
