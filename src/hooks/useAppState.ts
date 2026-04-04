/**
 * App State Hook
 * Monitors app foreground/background state for native apps
 */

import { useEffect, useState, useCallback } from 'react';
import { isNativeApp } from '@/utils/nativeUtils';

interface AppState {
  isActive: boolean;
  lastActiveTime: number | null;
  backgroundDuration: number;
}

export const useAppState = () => {
  const [appState, setAppState] = useState<AppState>({
    isActive: true,
    lastActiveTime: null,
    backgroundDuration: 0,
  });

  const handleStateChange = useCallback((isActive: boolean) => {
    setAppState((prev) => {
      if (isActive) {
        // App becoming active
        const backgroundDuration = prev.lastActiveTime
          ? Date.now() - prev.lastActiveTime
          : 0;
        return {
          isActive: true,
          lastActiveTime: null,
          backgroundDuration,
        };
      } else {
        // App going to background
        return {
          isActive: false,
          lastActiveTime: Date.now(),
          backgroundDuration: 0,
        };
      }
    });
  }, []);

  useEffect(() => {
    if (isNativeApp()) {
      let cleanup: (() => void) | undefined;

      const setupListener = async () => {
        try {
          const { App } = await import('@capacitor/app');
          
          const listener = await App.addListener('appStateChange', ({ isActive }) => {
            handleStateChange(isActive);
          });

          cleanup = () => {
            listener.remove();
          };
        } catch (error) {
          console.error('Error setting up app state listener:', error);
        }
      };

      setupListener();

      return () => {
        cleanup?.();
      };
    } else {
      // Web fallback using visibility API
      const handleVisibility = () => {
        handleStateChange(!document.hidden);
      };

      document.addEventListener('visibilitychange', handleVisibility);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
      };
    }
  }, [handleStateChange]);

  return appState;
};

export default useAppState;