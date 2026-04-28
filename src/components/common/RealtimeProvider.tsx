import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { 
  useUniversalRealtime, 
  getConnectionStatus,
  subscribeToTables,
  forceReconnectChannel
} from '@/hooks/useUniversalRealtime';

const isAdminRoute = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

/**
 * 🌐 Global Real-time Provider
 * 
 * Wraps the entire app to provide:
 * - Connection status monitoring
 * - Global event broadcasting
 * - Toast notifications for important updates
 * - Centralized real-time state management
 * - Auto-reconnect on app resume (no refresh needed)
 */

interface RealtimeContextType {
  isConnected: boolean;
  subscriberCount: number;
  monitoredTables: number;
  lastEvent: {
    table: string;
    event: string;
    timestamp: Date;
  } | null;
  forceReconnect: () => void;
}

const RealtimeContext = createContext<RealtimeContextType>({
  isConnected: false,
  subscriberCount: 0,
  monitoredTables: 0,
  lastEvent: null,
  forceReconnect: () => {}
});

export const useRealtimeContext = () => useContext(RealtimeContext);

interface RealtimeProviderProps {
  children: ReactNode;
  showConnectionStatus?: boolean;
  notifyOnImportantUpdates?: boolean;
}

export const RealtimeProvider: React.FC<RealtimeProviderProps> = ({
  children,
  showConnectionStatus = false,
  notifyOnImportantUpdates = true
}) => {
  const { toast } = useToast();
  const [connectionState, setConnectionState] = useState(getConnectionStatus());
  const [lastEvent, setLastEvent] = useState<RealtimeContextType['lastEvent']>(null);

  // Update connection status only when showConnectionStatus is enabled
  useEffect(() => {
    if (isAdminRoute()) return;
    if (!showConnectionStatus) return;
    const interval = setInterval(() => {
      setConnectionState(getConnectionStatus());
    }, 15000); // Reduced from 5s to 15s
    return () => clearInterval(interval);
  }, [showConnectionStatus]);

  // Subscribe to important tables for notifications - DEFERRED to reduce channel pressure
  useEffect(() => {
    if (isAdminRoute()) return;
    if (!notifyOnImportantUpdates) return;

    // Defer subscription by 5 seconds to prioritize initial render
    const timer = setTimeout(() => {
      const unsub = subscribeToTables(
        'global-notifications',
        ['notifications', 'topup_requests'],
        (table, event, payload) => {
          setLastEvent({
            table,
            event,
            timestamp: new Date()
          });

          if (event === 'INSERT' && table === 'topup_requests' && payload?.status === 'pending') {
            toast({
              title: "New Recharge Request",
              description: "A new recharge request has arrived",
            });
          }
        }
      );
      cleanupRef.current = unsub;
    }, 5000);

    const cleanupRef = { current: () => {} };
    return () => {
      clearTimeout(timer);
      cleanupRef.current();
    };
  }, [notifyOnImportantUpdates, toast]);

  // Force reconnect without page reload
  const forceReconnect = useCallback(() => {
    if (isAdminRoute()) return;
    console.log('[RealtimeProvider] 🔄 Force reconnect triggered');
    forceReconnectChannel();
  }, []);

  const value: RealtimeContextType = {
    isConnected: connectionState.isConnected,
    subscriberCount: connectionState.subscriberCount,
    monitoredTables: connectionState.monitoredTables,
    lastEvent,
    forceReconnect
  };

  return (
    <RealtimeContext.Provider value={value}>
      {children}
      
      {/* Optional connection status indicator */}
      {showConnectionStatus && (
        <div className="fixed bottom-20 right-4 z-50">
          <div 
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg backdrop-blur-sm ${
              connectionState.isConnected 
                ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            <div 
              className={`w-2 h-2 rounded-full ${
                connectionState.isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
              }`} 
            />
            <span>
              {connectionState.isConnected ? 'Real-time Active' : 'Disconnected'}
            </span>
            <span className="text-muted-foreground">
              ({connectionState.subscriberCount} listeners)
            </span>
          </div>
        </div>
      )}
    </RealtimeContext.Provider>
  );
};

export default RealtimeProvider;
