import { useState, useEffect } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor } from '@capacitor/core';

const readDims = () => {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  // Prefer visualViewport on mobile (excludes URL bar collapse jitter)
  const vv = window.visualViewport;
  const width = Math.round(vv?.width ?? window.innerWidth);
  const height = Math.round(vv?.height ?? window.innerHeight);
  return { width, height };
};

export const useMobileOrientation = () => {
  const initial = readDims();
  const [isLandscape, setIsLandscape] = useState(initial.width > initial.height);
  const [dimensions, setDimensions] = useState(initial);

  useEffect(() => {
    let rafId: number | null = null;

    const sync = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      // Defer to next frame so orientationchange-triggered viewport resize settles first
      rafId = requestAnimationFrame(() => {
        const { width, height } = readDims();
        setDimensions((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
        setIsLandscape(width > height);
      });
    };

    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);

    let orientationListener: any;
    if (Capacitor.isNativePlatform()) {
      ScreenOrientation.addListener('screenOrientationChange', () => {
        // Re-read real viewport rather than trusting event type — webview resize lags the event
        sync();
        // Capacitor webview can take a beat to repaint; double-tap after 150ms
        setTimeout(sync, 150);
      }).then((handle) => {
        orientationListener = handle;
      });
    }

    // Initial sync to catch any state drift from SSR/hydration
    sync();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      if (orientationListener) {
        orientationListener.remove();
      }
    };
  }, []);

  return {
    isLandscape,
    isPortrait: !isLandscape,
    ...dimensions,
    isSmallHeight: dimensions.height < 500,
    isVerySmallHeight: dimensions.height < 400,
  };
};
