/**
 * Pkg428 — Helper hooks for native image prefetch + interceptor wiring.
 *
 *   useNativeImagePrefetch(urls)        — fire-and-forget prefetch when the
 *                                          visible URL list changes. No-op
 *                                          when the flag is off / not on
 *                                          Android.
 *   useNativeImageInterceptor()         — install/uninstall the WebView
 *                                          image interceptor based on flag.
 *                                          Mount once near the app root.
 *                                          Reacts live to Developer-Options
 *                                          flag toggles (no reload needed).
 */
import { useEffect, useRef } from 'react';
import { prefetchImages, setImageInterceptorEnabled } from '@/plugins/NativeImageLoader';
import {
  isNativeImageFlagEnabled,
  isImageInterceptorEnabled,
} from '@/utils/imageNativeFlag';
import { subscribeNativeFlags } from '@/utils/nativeFlags';

export function useNativeImagePrefetch(urls: Array<string | null | undefined>): void {
  const lastKeyRef = useRef<string>('');
  useEffect(() => {
    if (!isNativeImageFlagEnabled()) return;
    const clean = (urls || []).filter(
      (u): u is string => typeof u === 'string' && u.length > 0
    );
    if (clean.length === 0) return;
    const key = clean.slice(0, 60).join('|');
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    void prefetchImages(clean.slice(0, 40));
  }, [urls]);
}

let interceptorMounted = false;
export function useNativeImageInterceptor(): void {
  useEffect(() => {
    if (interceptorMounted) return;
    interceptorMounted = true;

    const apply = () => {
      void setImageInterceptorEnabled(isImageInterceptorEnabled());
    };

    // Initial apply + live re-apply when any native flag toggles
    // (Developer Options screen flips `nativeImageLoader`).
    apply();
    const unsub = subscribeNativeFlags((key) => {
      if (key === 'nativeImageLoader') apply();
    });

    return () => {
      interceptorMounted = false;
      unsub();
      void setImageInterceptorEnabled(false);
    };
  }, []);
}
