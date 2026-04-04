/**
 * Native App Utilities
 * Handles all native-specific functionality to keep the app contained
 */

import { Capacitor } from '@capacitor/core';

const getUserAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');
const hasNativeUserAgent = () => /MeriLive-(Android|iOS)-Native/i.test(getUserAgent());

export const isNativeAndroidApp = (): boolean => {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return true;
  return /MeriLive-Android-Native/i.test(getUserAgent());
};

export const isNativeIOSApp = (): boolean => {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return true;
  return /MeriLive-iOS-Native/i.test(getUserAgent());
};

// Check if running as native app (Capacitor bridge OR user agent fallback)
export const isNativeApp = (): boolean => {
  return Capacitor.isNativePlatform() || hasNativeUserAgent() || isNativeAndroidApp() || isNativeIOSApp();
};

// Get platform (android, ios, web)
export const getPlatform = (): 'android' | 'ios' | 'web' => {
  if (isNativeAndroidApp()) return 'android';
  if (isNativeIOSApp()) return 'ios';
  return Capacitor.getPlatform() as 'android' | 'ios' | 'web';
};

// Check if running on Android
export const isAndroid = (): boolean => {
  return isNativeAndroidApp();
};

// Check if running on iOS
export const isIOS = (): boolean => {
  return isNativeIOSApp();
};

// Safe area insets for notched devices
export const getSafeAreaInsets = () => {
  return {
    top: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0'),
    bottom: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0'),
    left: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sal') || '0'),
    right: parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sar') || '0'),
  };
};

// Handle external URLs - always open in-app (never external browser)
export const openUrl = async (url: string, inApp: boolean = true): Promise<void> => {
  const { openInApp } = await import('@/utils/inAppNavigation');
  await openInApp(url, { useOverlay: !inApp ? false : true });
};

// Close in-app browser
export const closeBrowser = async (): Promise<void> => {
  if (isNativeApp()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    }
  }
};

// Handle deep links
export const handleDeepLink = (url: string): { path: string; params: Record<string, string> } => {
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    const params: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return { path, params };
  } catch {
    return { path: '/', params: {} };
  }
};

// Haptic feedback
export const hapticFeedback = async (style: 'light' | 'medium' | 'heavy' = 'light'): Promise<void> => {
  if (isNativeApp()) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      const styleMap = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      };
      await Haptics.impact({ style: styleMap[style] });
    } catch (error) {
      // Haptics not available, silently fail
    }
  } else if ('vibrate' in navigator) {
    const durations = { light: 10, medium: 20, heavy: 30 };
    navigator.vibrate(durations[style]);
  }
};

// Vibrate pattern
export const vibrate = async (pattern: number | number[]): Promise<void> => {
  if (isNativeApp()) {
    try {
      const { Haptics, NotificationType } = await import('@capacitor/haptics');
      await Haptics.notification({ type: NotificationType.Success });
    } catch (error) {
      // Fallback to web vibrate
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
      }
    }
  } else if ('vibrate' in navigator) {
    navigator.vibrate(pattern);
  }
};

// Keep screen awake (for live streams)
// Note: Requires @capacitor-community/keep-awake to be installed locally
export const setKeepScreenAwake = async (keep: boolean): Promise<void> => {
  if (isNativeApp()) {
    // This feature requires local installation of @capacitor-community/keep-awake
    // Run: npm install @capacitor-community/keep-awake
    console.log('Keep screen awake:', keep);
  }
};

// Status bar control
export const setStatusBarStyle = async (style: 'dark' | 'light'): Promise<void> => {
  if (isNativeApp()) {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ 
        style: style === 'dark' ? Style.Dark : Style.Light 
      });
      await StatusBar.setBackgroundColor({ color: '#0a0a0f' });
    } catch (error) {
      console.error('Error setting status bar:', error);
    }
  }
};

// Hide splash screen
export const hideSplashScreen = async (): Promise<void> => {
  if (isNativeApp()) {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch (error) {
      console.error('Error hiding splash screen:', error);
    }
  }
};

// App state listener
export const onAppStateChange = (callback: (isActive: boolean) => void): (() => void) => {
  if (isNativeApp()) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('appStateChange', ({ isActive }) => {
        callback(isActive);
      });
    });
    
    return () => {
      import('@capacitor/app').then(({ App }) => {
        App.removeAllListeners();
      });
    };
  }
  
  // Web fallback
  const handleVisibilityChange = () => {
    callback(!document.hidden);
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
};

// Back button handler for Android
export const onBackButton = (callback: () => void): (() => void) => {
  if (isAndroid()) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('backButton', callback);
    });
    
    return () => {
      import('@capacitor/app').then(({ App }) => {
        App.removeAllListeners();
      });
    };
  }
  
  return () => {};
};

// Exit app (Android only)
export const exitApp = async (): Promise<void> => {
  if (isAndroid()) {
    try {
      const { App } = await import('@capacitor/app');
      await App.exitApp();
    } catch (error) {
      console.error('Error exiting app:', error);
    }
  }
};

// Get app info
export const getAppInfo = async (): Promise<{ version: string; build: string; name: string }> => {
  if (isNativeApp()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      return {
        version: info.version,
        build: info.build,
        name: info.name,
      };
    } catch (error) {
      console.error('Error getting app info:', error);
    }
  }
  
  return { version: '1.0.0', build: '1', name: 'MeriLive' };
};

// Network status
export const getNetworkStatus = async (): Promise<{ connected: boolean; type: string }> => {
  if (isNativeApp()) {
    try {
      const { Network } = await import('@capacitor/network');
      const status = await Network.getStatus();
      return {
        connected: status.connected,
        type: status.connectionType,
      };
    } catch (error) {
      console.error('Error getting network status:', error);
    }
  }
  
  return { connected: navigator.onLine, type: 'unknown' };
};

// Share content
export const shareContent = async (options: {
  title: string;
  text?: string;
  url?: string;
  files?: File[];
}): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: options.title,
        text: options.text,
        url: options.url,
        dialogTitle: options.title,
      });
      return true;
    } catch (error) {
      console.error('Error sharing:', error);
      return false;
    }
  }
  
  // Web fallback
  if (navigator.share) {
    try {
      await navigator.share(options);
      return true;
    } catch {
      return false;
    }
  }
  
  return false;
};

// Clipboard
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (isNativeApp()) {
    try {
      const { Clipboard } = await import('@capacitor/clipboard');
      await Clipboard.write({ string: text });
      return true;
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      return false;
    }
  }
  
  // Web fallback
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

// Initialize native features
export const initializeNativeApp = async (): Promise<void> => {
  if (!isNativeApp()) return;
  
  try {
    // Hide splash screen after app loads
    await hideSplashScreen();
    
    // Set status bar style
    await setStatusBarStyle('dark');
    
    // Set up CSS variables for safe areas
    document.documentElement.style.setProperty('--sat', 'env(safe-area-inset-top)');
    document.documentElement.style.setProperty('--sab', 'env(safe-area-inset-bottom)');
    document.documentElement.style.setProperty('--sal', 'env(safe-area-inset-left)');
    document.documentElement.style.setProperty('--sar', 'env(safe-area-inset-right)');
    
    console.log('✅ Native app initialized');
  } catch (error) {
    console.error('Error initializing native app:', error);
  }
};