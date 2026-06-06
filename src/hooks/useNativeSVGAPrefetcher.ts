import { useEffect } from 'react';
import NativeSVGA, { isNativeSVGAAvailable } from '@/plugins/NativeSVGA';
import { getNativeFlag } from '@/utils/nativeFlags';

/**
 * useNativeSVGAPrefetcher — auto-warms popular SVGA assets on Android.
 * 
 * When the native flag is ON, this hook sends popular gift URLs to the
 * native disk cache manager in the background.
 */
export const useNativeSVGAPrefetcher = (urls: string[]) => {
  useEffect(() => {
    const run = async () => {
      const isNative = getNativeFlag('reelsNative'); // Using a general performance flag or similar
      const available = await isNativeSVGAAvailable();
      
      if (!isNative || !available || urls.length === 0) return;

      try {
        await NativeSVGA.prefetchBatch({ urls: urls.slice(0, 20) });
        console.log('[NativeSVGA] ✅ Prefetched popular assets:', urls.length);
      } catch (err) {
        console.warn('[NativeSVGA] ❌ Prefetch failed:', err);
      }
    };

    run();
  }, [urls]);
};
