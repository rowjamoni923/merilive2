import { normalizeGiftMediaUrl } from '@/utils/giftMediaUrl';
import { getVapCompositeHint } from '@/utils/vapDetection';

export type ProfessionalAnimationFormat =
  | 'svga'
  | 'vap'
  | 'pag'
  | 'lottie'
  | 'gif'
  | 'webp'
  | 'png'
  | 'mp4'
  | 'webm'
  | 'static';

const cleanPath = (url?: string | null) => (url || '').split('?')[0].split('#')[0].toLowerCase();

const normalizeDeclaredFormat = (format?: string | null): ProfessionalAnimationFormat | null => {
  const f = (format || '').toLowerCase().trim();
  if (f === 'json') return 'lottie';
  if (f === 'video' || f === 'custom') return null;
  if (
    f === 'svga' || f === 'vap' || f === 'pag' || f === 'lottie' ||
    f === 'gif' || f === 'webp' || f === 'png' || f === 'mp4' || f === 'webm'
  ) return f;
  return null;
};

export const detectProfessionalAnimationFormat = (
  url?: string | null,
  declaredFormat?: string | null,
): ProfessionalAnimationFormat | null => {
  const normalizedUrl = normalizeGiftMediaUrl(url || '') || url || '';
  if (!normalizedUrl) return null;
  const declared = normalizeDeclaredFormat(declaredFormat);
  const path = cleanPath(normalizedUrl);

  if (path.endsWith('.svga')) return 'svga';
  if (path.endsWith('.pag')) return 'pag';
  if (path.endsWith('.json')) return declared === 'vap' ? 'vap' : 'lottie';
  if (path.endsWith('.gif')) return 'gif';
  if (path.endsWith('.webp')) return 'webp';
  if (path.endsWith('.png')) return 'png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'static';
  if (path.endsWith('.webm')) return declared === 'vap' || getVapCompositeHint(normalizedUrl) ? 'vap' : 'webm';
  if (path.endsWith('.mp4') || path.endsWith('.mov') || path.endsWith('.m4v')) {
    if (declared === 'vap' || getVapCompositeHint(normalizedUrl) || /(?:^|[\W_])(vap|vapx|alpha|rgb_alpha|file_vap|_bmp)(?:[\W_]|$)/i.test(normalizedUrl)) {
      return 'vap';
    }
    return 'mp4';
  }

  return declared;
};

export const isAnimatedProfessionalFormat = (format?: string | null): boolean => {
  const f = normalizeDeclaredFormat(format);
  return !!f && f !== 'png' && f !== 'static';
};
