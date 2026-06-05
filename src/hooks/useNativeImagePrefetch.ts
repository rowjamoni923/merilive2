/**
 * Pkg428 — Helper hooks for native image prefetch + interceptor wiring.
 *
 *   useNativeImagePrefetch(urls)   — fire-and-forget prefetch when the
 *                                     visible URL list changes. No-op when
 *                                     the flag is off / not on Android.
 *   useNativeImageInterceptor()    — install/uninstall the WebView image
 *                                     interceptor on mount based on flag.
 *                                     Mount once near the app root.
 */
import { useEffect, useRef } from 'react';
import { prefetchImages, setImageInterceptorEnabled } from '@/plugins/NativeImageLoader';
import {
  isNativeImageFlagEnabled,
  isImageInterceptorEnabled,
} from '@/utils/imageNativeFlag';

export function useNativeImagePrefetch(urls: Array<string | null | undefined>): void {
  const lastKeyRef = useRef<string>('');
  useEffect(() => {
    if (!isNativeImageFlagEnabled()) return;
    const clean = (urls || []).filter(
      (u): u is string => typeof u === 'string' && u.length > 0
    );
    if (clean.length === 0) return;
    // Stable key to avoid duplicate prefetch on shallow re-renders.
    const key = clean.slice(0, 60).join('|');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    // Cap at 40 URLs per call — keep first-screen warmup tight.
    void prefetchImages(clean.slice(0, 40));
  }, [urls]);
}

let interceptorMounted = false;
export function useNativeImageInterceptor(): void {
  useEffect(() => {
    if (interceptorMounted) return;
    interceptorMounted = true;
    const want = isImageInterceptorEnabled();
    void setImageInterceptorEnabled(want);
    return () => {
      interceptorMounted = false;
      void setImageInterceptorEnabled(false);
    };
  }, []);
}
