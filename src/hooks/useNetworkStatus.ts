/**
 * Network Status Hook
 * Monitors network connectivity for native apps
 */

import { useEffect, useState, useCallback } from 'react';
import { isNativeApp } from '@/utils/nativeUtils';
import { toast } from '@/hooks/use-toast';

interface NetworkStatus {
  connected: boolean;
  connectionType: string;
}

export const useNetworkStatus = (showToasts: boolean = true) => {
  const [status, setStatus] = useState<NetworkStatus>({
    connected: navigator.onLine,
    connectionType: 'unknown',
  });

  const handleStatusChange = useCallback((newStatus: NetworkStatus, previousConnected: boolean) => {
    setStatus(newStatus);

    if (showToasts) {
      if (!newStatus.connected && previousConnected) {
        toast({
          title: "No Internet Connection",
          description: "Please check your network settings",
          variant: "destructive",
        });
      } else if (newStatus.connected && !previousConnected) {
        toast({
          title: "Back Online",
          description: "Connection restored",
        });
      }
    }
  }, [showToasts]);

  useEffect(() => {
    if (isNativeApp()) {
      let cleanup: (() => void) | undefined;

      const setupListener = async () => {
        try {
          const { Network } = await import('@capacitor/network');
          
          // Get initial status
          const initialStatus = await Network.getStatus();
          setStatus({
            connected: initialStatus.connected,
            connectionType: initialStatus.connectionType,
          });

          // Listen for changes
          const listener = await Network.addListener('networkStatusChange', (newStatus) => {
            handleStatusChange(
              {
                connected: newStatus.connected,
                connectionType: newStatus.connectionType,
              },
              status.connected
            );
          });

          cleanup = () => {
            listener.remove();
          };
        } catch (error) {
          console.error('Error setting up network listener:', error);
        }
      };

      setupListener();

      return () => {
        cleanup?.();
      };
    } else {
      // Web fallback
      const handleOnline = () => {
        handleStatusChange({ connected: true, connectionType: 'unknown' }, false);
      };

      const handleOffline = () => {
        handleStatusChange({ connected: false, connectionType: 'none' }, true);
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }
  }, [handleStatusChange, status.connected]);

  return status;
};

export default useNetworkStatus;