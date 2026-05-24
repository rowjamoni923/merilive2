/**
 * Live Stream Lifecycle Hook
 * 1. Host heartbeat every 15s (server detects stale after 60s)
 * 2. Keeps native Android live alive until the host explicitly ends it
 * 3. Viewer-side stale stream detection
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp } from '@/utils/nativeUtils';

const getSupabaseAuthStorageKey = () => {
  try {
    const host = new URL(import.meta.env.VITE_SUPABASE_URL).host;
    const projectRef = host.split('.')[0];
    return `sb-${projectRef}-auth-token`;
  } catch {
    return null;
  }
};

const getSupabasePublishableKey = () =>
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

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
      // Pkg78: Supabase `live-stream-close-${streamId}` broadcast REMOVED.
      // Pkg74 LiveKit DataPacket (publishStreamEnded) + LiveKit ParticipantDisconnected
      // event on viewer side already deliver instant close. On page-unload the
      // LiveKit Room disconnect itself triggers viewer-side detection — no Supabase
      // fallback needed (prevents the $1400-bill dual-path pattern).


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
              'apikey': getSupabasePublishableKey(),
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

    // Can't await on unload, so use stored auth token if available
    try {
      const authStorageKey = getSupabaseAuthStorageKey();
      const session = JSON.parse((authStorageKey && localStorage.getItem(authStorageKey)) || '{}');
      const token = session?.access_token;
      if (token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/live_streams?id=eq.${streamId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': getSupabasePublishableKey(),
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

  // HOST: Lifecycle monitoring (exit/close)
  useEffect(() => {
    if (!streamId || !isHost || !isHostVerified) return;

    console.log('[LiveStream Lifecycle] Setting up lifecycle monitoring for host stream:', streamId);

    // ============ NATIVE APP HANDLING ============
    // Android LiveKit runs through a foreground service. Transient Capacitor
    // pause/appStateChange events happen during permission dialogs, PiP,
    // notification shade, camera handoff and brief network switches. Ending the
    // DB room from those events caused 5–15s premature stream closures.
    // Requirement: host stays live until they press the in-room X button.
    if (isNativeApp()) {
      const setupNativeListener = async () => {
        try {
          const { App } = await import('@capacitor/app');
          
          const stateListener = await App.addListener('appStateChange', ({ isActive }) => {
            console.log('[LiveStream Lifecycle] App state:', isActive ? 'FOREGROUND' : 'BACKGROUND');
          });

          const pauseListener = await App.addListener('pause', () => {
            console.log('[LiveStream Lifecycle] App paused — native LiveKit foreground service keeps stream alive');
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

      return () => {
        cleanupRef.current?.();
        cleanupRef.current = null;

        // Native Android live uses a foreground LiveKit service. Never end the
        // DB stream from React cleanup/page lifecycle; only the host's explicit
        // in-room end button may close the stream.
      };
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
      
      // Do not end on React effect cleanup. StrictMode/dev remounts and native
      // WebView lifecycle churn can run cleanup while the stream must continue.
      // Manual end path still updates live_streams and notifies viewers.
    };
  }, [streamId, isHost, isHostVerified, forceEndStream, forceEndStreamSync]);

  return {
    forceEndStream,
    hasEnded: hasEndedRef.current,
  };
};

export default useLiveStreamLifecycle;
