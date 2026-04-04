/**
 * Native Back Button Handler Hook
 * Handles Android back button behavior for native app
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isAndroid, exitApp } from '@/utils/nativeUtils';
import { toast } from '@/hooks/use-toast';

interface UseNativeBackButtonOptions {
  onBack?: () => boolean; // Return true to prevent default behavior
  exitOnRoot?: boolean; // Whether to exit app when on root page
}

export const useNativeBackButton = (options: UseNativeBackButtonOptions = {}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPress = useRef<number>(0);
  const { onBack, exitOnRoot = true } = options;

  const handleBackButton = useCallback(async () => {
    // If custom handler exists and returns true, don't proceed
    if (onBack && onBack()) {
      return;
    }

    // Root pages where back should exit/confirm exit
    const rootPages = ['/', '/discover', '/live', '/chat', '/profile'];
    const isRootPage = rootPages.includes(location.pathname);

    if (isRootPage && exitOnRoot) {
      const now = Date.now();
      if (now - lastBackPress.current < 2000) {
        // Double back press - exit app
        await exitApp();
      } else {
        // First back press - show toast
        lastBackPress.current = now;
        toast({
          title: "Press back again to exit",
          duration: 2000,
        });
      }
    } else {
      // Navigate back
      navigate(-1);
    }
  }, [navigate, location.pathname, onBack, exitOnRoot]);

  useEffect(() => {
    if (!isAndroid()) return;

    let cleanup: (() => void) | undefined;

    const setupListener = async () => {
      try {
        const { App } = await import('@capacitor/app');
        
        const listener = await App.addListener('backButton', (event) => {
          // Prevent default if we're handling it
          if (event.canGoBack) {
            handleBackButton();
          } else {
            handleBackButton();
          }
        });

        cleanup = () => {
          listener.remove();
        };
      } catch (error) {
        console.error('Error setting up back button listener:', error);
      }
    };

    setupListener();

    return () => {
      cleanup?.();
    };
  }, [handleBackButton]);

  return { handleBackButton };
};

export default useNativeBackButton;