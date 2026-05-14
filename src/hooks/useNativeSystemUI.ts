/**
 * Native Android System UI integration
 * Handles status bar, navigation bar, immersive mode
 */
import { useEffect, useCallback } from 'react';
import { isNativeApp, isAndroid } from '@/utils/nativeUtils';

/**
 * Configure Android system bars for immersive experience
 */
export function useNativeSystemUI() {
  // Configure status bar for the white/professional app shell.
  // Capacitor naming: Style.Dark = dark text/icons (used on LIGHT backgrounds).
  const configureSystemBars = useCallback(async () => {
    if (!isNativeApp()) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');

      // White status bar with dark icons → professional, blends with app
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#ffffff' });

      console.log('[SystemUI] ✅ Status bar configured — white surface, dark icons');
    } catch (err) {
      console.warn('[SystemUI] Status bar config failed:', err);
    }
  }, []);

  // Set status bar for specific page themes
  const setStatusBarForPage = useCallback(async (theme: 'dark' | 'light' | 'transparent') => {
    if (!isNativeApp()) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      
      switch (theme) {
        case 'dark':
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#0a0a0f' });
          break;
        case 'light':
          await StatusBar.setStyle({ style: Style.Light });
          await StatusBar.setBackgroundColor({ color: '#f5f5f5' });
          break;
        case 'transparent':
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#00000000' });
          await StatusBar.setOverlaysWebView({ overlay: true });
          break;
      }
    } catch (err) {
      console.warn('[SystemUI] setStatusBarForPage failed:', err);
    }
  }, []);

  // Hide status bar for full immersive mode (live streams, calls)
  const enterImmersiveMode = useCallback(async () => {
    if (!isNativeApp()) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
      console.log('[SystemUI] Entered immersive mode');
    } catch (err) {
      console.warn('[SystemUI] Immersive mode failed:', err);
    }
  }, []);

  const exitImmersiveMode = useCallback(async () => {
    if (!isNativeApp()) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.show();
      await StatusBar.setStyle({ style: (await import('@capacitor/status-bar')).Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#0a0a0f' });
    } catch (err) {
      console.warn('[SystemUI] Exit immersive failed:', err);
    }
  }, []);

  // Initial configuration
  useEffect(() => {
    configureSystemBars();
  }, [configureSystemBars]);

  return {
    setStatusBarForPage,
    enterImmersiveMode,
    exitImmersiveMode,
  };
}

export default useNativeSystemUI;
