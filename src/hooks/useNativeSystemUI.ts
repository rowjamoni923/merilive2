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
  // Set status bar transparent + overlay mode
  const configureSystemBars = useCallback(async () => {
    if (!isNativeApp()) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      
      // Dark content on transparent background for immersive feel
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#00000000' }); // Transparent
      await StatusBar.setOverlaysWebView({ overlay: true });

      console.log('[SystemUI] ✅ Status bar configured - transparent overlay');
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
