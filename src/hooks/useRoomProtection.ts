/**
 * Room Protection Hook
 * 
 * Protects Party Room and Live Stream from:
 * 1. Accidental back button exit (only close button should exit)
 * 2. Keeps the room open during transient network drops while LiveKit reconnects
 * 
 * Features:
 * - Back button is completely blocked in rooms
 * - Network monitoring with non-destructive reconnect feedback
 * - Proper cleanup on unmount
 */

import { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network } from '@capacitor/network';
import { App } from '@capacitor/app';
import { toast } from 'sonner';
import { isAndroid, isIOS, isNativeApp } from '@/utils/nativeUtils';

interface UseRoomProtectionOptions {
  /** Room type for proper messaging */
  roomType: 'live' | 'party';
  /** Callback when network is lost (must not end the room automatically) */
  onNetworkClose?: () => void;
  /** Whether protection is active */
  enabled?: boolean;
}

interface UseRoomProtectionReturn {
  /** Whether network is currently connected */
  isConnected: boolean;
  /** Force close the room (for close button) */
  closeRoom: () => void;
}

export function useRoomProtection({
  roomType,
  onNetworkClose,
  enabled = true,
}: UseRoomProtectionOptions): UseRoomProtectionReturn {
  const navigate = useNavigate();
  const isConnectedRef = useRef(true);
  const backButtonListenerRef = useRef<any>(null);
  const networkListenerRef = useRef<any>(null);
  const hasClosedRef = useRef(false);
  const onNetworkCloseRef = useRef(onNetworkClose);

  // Keep callback ref updated without forcing listener re-subscription on every render
  useEffect(() => {
    onNetworkCloseRef.current = onNetworkClose;
  }, [onNetworkClose]);

  // Close room handler
  const closeRoom = useCallback(() => {
    if (hasClosedRef.current) return;
    hasClosedRef.current = true;
    
    // Navigate to home
    navigate('/', { replace: true });
  }, [navigate]);

  // Network change handler
  const handleNetworkChange = useCallback((status: { connected: boolean }) => {
    console.log(`[useRoomProtection] Network status changed:`, status.connected);
    isConnectedRef.current = status.connected;

    if (!status.connected) {
      const roomName = roomType === 'live' ? 'Live Stream' : 'Party Room';
      
      toast.error(`Network disconnected`, {
        description: `${roomName} is reconnecting...`,
        duration: 3000,
      });

      // Call latest callback for recovery UI only. Do NOT auto-close/end the
      // database room: LiveKit's reconnect policy + native foreground service
      // must keep live/party/private-call sessions alive through short drops.
      onNetworkCloseRef.current?.();
    }
  }, [roomType, closeRoom]);

  // Back button handler - COMPLETELY BLOCK
  const handleBackButton = useCallback(() => {
    console.log(`[useRoomProtection] Back button pressed - BLOCKED`);
    
    const roomName = roomType === 'live' ? 'Live' : 'Party Room';
    
    toast.info(`Press X button to exit ${roomName}`, {
      duration: 2000,
      id: 'back-button-blocked',
    });

    // Return true to indicate we handled it (prevent default)
    return true;
  }, [roomType]);

  // Setup back button blocking
  useEffect(() => {
    if (!enabled) return;

    const setupBackButtonBlock = async () => {
      try {
        if (isNativeApp()) {
          // Remove any existing listener
          if (backButtonListenerRef.current) {
            await backButtonListenerRef.current.remove();
          }

          // Add new listener that blocks back button
          backButtonListenerRef.current = await App.addListener('backButton', (event) => {
            // Always prevent default - user must use close button
            event.canGoBack = false;
            handleBackButton();
          });

          console.log('[useRoomProtection] ✅ Back button blocked for', roomType);
        }
      } catch (error) {
        console.error('[useRoomProtection] Error setting up back button block:', error);
      }
    };

    setupBackButtonBlock();

    return () => {
      if (backButtonListenerRef.current) {
        backButtonListenerRef.current.remove().catch(() => {});
        backButtonListenerRef.current = null;
      }
    };
  }, [enabled, handleBackButton, roomType]);

  // Setup network monitoring
  useEffect(() => {
    if (!enabled) return;

    const setupNetworkMonitoring = async () => {
      try {
        // Check initial status
        const status = await Network.getStatus();
        isConnectedRef.current = status.connected;
        console.log('[useRoomProtection] Initial network status:', status.connected);

        // Setup listener
        networkListenerRef.current = await Network.addListener('networkStatusChange', handleNetworkChange);
        console.log('[useRoomProtection] ✅ Network monitoring active for', roomType);
      } catch (error) {
        console.error('[useRoomProtection] Error setting up network monitoring:', error);
        // Fallback: assume connected on web
        isConnectedRef.current = true;
      }
    };

    setupNetworkMonitoring();

    return () => {
      if (networkListenerRef.current) {
        networkListenerRef.current.remove().catch(() => {});
        networkListenerRef.current = null;
      }
    };
  }, [enabled, handleNetworkChange, roomType]);

  // Web fallback for network monitoring
  useEffect(() => {
    if (!enabled || isNativeApp()) return;

    const handleOnline = () => {
      console.log('[useRoomProtection] Web: Network online');
      isConnectedRef.current = true;
    };

    const handleOffline = () => {
      console.log('[useRoomProtection] Web: Network offline');
      handleNetworkChange({ connected: false });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [enabled, handleNetworkChange]);

  // Web fallback for back button (browser history)
  useEffect(() => {
    if (!enabled || isNativeApp()) return;

    // Push a dummy state to prevent back navigation
    const preventBack = () => {
      window.history.pushState(null, '', window.location.href);
    };

    const handlePopState = (event: PopStateEvent) => {
      // Prevent back navigation
      event.preventDefault();
      preventBack();
      handleBackButton();
    };

    // Push initial state
    preventBack();

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled, handleBackButton]);

  return {
    isConnected: isConnectedRef.current,
    closeRoom,
  };
}

export default useRoomProtection;
