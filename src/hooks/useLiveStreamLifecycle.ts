/**
 * Live Stream Lifecycle Hook
 * 1. Host heartbeat every 15s (server detects stale after 60s)
 * 2. Ends stream on app exit/background/close using proper auth
 * 3. Viewer-side stale stream detection
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp } from '@/utils/nativeUtils';

interface UseLiveStreamLifecycleProps {
  streamId: string | undefined;
  isHost: boolean;
  isHostVerified: boolean;
  onStreamEnd: () => Promise<void>;
}

export const useLiveStreamLifecycle = ({
  streamId,
  isHost,
  isHostVerified,
  onStreamEnd,
}: UseLiveStreamLifecycleProps) => {
  const hasEndedRef = useRef(false);
  const cleanupRef = useRef<(() => void) | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Force end stream using Supabase client (proper auth)
  const forceEndStream = useCallback(async () => {
    if (hasEndedRef.current || !streamId || !isHost) return;
    hasEndedRef.current = true;
    
    console.log('[LiveStream Lifecycle] Force ending stream:', streamId);
    
    try {
      // ⚡ INSTANT: Broadcast stream close to all viewers first
      try {
        await supabase.channel(`live-stream-close-${streamId}`).send({
          type: 'broadcast',
          event: 'stream_closed',
          payload: { streamId, hostName: 'Host' }
        });
      } catch (e) { /* broadcast is best-effort */ }

      // Primary: use Supabase client with user's session
      const { error } = await supabase
        .from('live_streams')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', streamId);
      
      if (error) {
        console.error('[LiveStream Lifecycle] Supabase update failed:', error);
        // Fallback: use fetch with keepalive + user token for page unload scenarios
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${streamId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${token}`,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({ is_active: false, ended_at: new Date().toISOString() }),
            keepalive: true,
          });
        }
      }
      
      console.log('[LiveStream Lifecycle] Stream ended successfully');
    } catch (error) {
      console.error('[LiveStream Lifecycle] Failed to end stream:', error);
    }
  }, [streamId, isHost]);

  // Fallback end for beforeunload (can't await)
  const forceEndStreamSync = useCallback(() => {
    if (hasEndedRef.current || !streamId || !isHost) return;
    hasEndedRef.current = true;

    // Use sendBeacon for reliable delivery during page unload
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/update_stream_heartbeat`;
    // Can't end via sendBeacon easily, so use fetch keepalive
    try {
      const session = JSON.parse(localStorage.getItem('sb-pppcwawjjpwwrmvezcdy-auth-token') || '{}');
      const token = session?.access_token;
      if (token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${streamId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${token}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ is_active: false, ended_at: new Date().toISOString() }),
          keepalive: true,
        });
      }
    } catch (e) {
      console.error('[LiveStream Lifecycle] Sync end failed:', e);
    }
  }, [streamId, isHost]);

  // HOST: Heartbeat every 15 seconds
  useEffect(() => {
    if (!streamId || !isHost || !isHostVerified) return;

    console.log('[LiveStream Lifecycle] Starting heartbeat for stream:', streamId);

    const sendHeartbeat = async () => {
      try {
        await supabase.rpc('update_stream_heartbeat', { stream_id: streamId });
      } catch (e) {
        console.error('[LiveStream Lifecycle] Heartbeat failed:', e);
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Send every 15 seconds
    heartbeatRef.current = setInterval(sendHeartbeat, 15000);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [streamId, isHost, isHostVerified]);

  // HOST: Lifecycle monitoring (exit/background/close)
  useEffect(() => {
    if (!streamId || !isHost || !isHostVerified) return;

    console.log('[LiveStream Lifecycle] Setting up lifecycle monitoring for host stream:', streamId);

    // ============ NATIVE APP HANDLING ============
    if (isNativeApp()) {
      const setupNativeListener = async () => {
        try {
          const { App } = await import('@capacitor/app');
          
          const stateListener = await App.addListener('appStateChange', async ({ isActive }) => {
            console.log('[LiveStream Lifecycle] App state:', isActive ? 'FOREGROUND' : 'BACKGROUND');
            if (!isActive && !hasEndedRef.current) {
              await forceEndStream();
            }
          });

          const pauseListener = await App.addListener('pause', async () => {
            console.log('[LiveStream Lifecycle] App paused');
            if (!hasEndedRef.current) {
              await forceEndStream();
            }
          });

          cleanupRef.current = () => {
            stateListener.remove();
            pauseListener.remove();
          };
        } catch (error) {
          console.error('[LiveStream Lifecycle] Native listener error:', error);
        }
      };
      setupNativeListener();
    }

    // ============ WEB HANDLING ============
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasEndedRef.current) {
        forceEndStreamSync();
        event.preventDefault();
        event.returnValue = 'Your live stream will end if you leave.';
      }
    };

    const handlePageHide = () => {
      if (!hasEndedRef.current) {
        forceEndStreamSync();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
      cleanupRef.current?.();
      
      if (!hasEndedRef.current) {
        forceEndStream();
      }
    };
  }, [streamId, isHost, isHostVerified, forceEndStream, forceEndStreamSync]);

  return {
    forceEndStream,
    hasEnded: hasEndedRef.current,
  };
};

export default useLiveStreamLifecycle;
