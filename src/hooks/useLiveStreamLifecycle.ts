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

  // Force end stream through the canonical close path (DataPacket first, RPC second).
  const forceEndStream = useCallback(async () => {
    if (hasEndedRef.current || !streamId || !isHost) return;
    hasEndedRef.current = true;
    
    console.log('[LiveStream Lifecycle] Force ending stream:', streamId);
    
    try {
      try {
        const { publishStreamEnded } = await import('@/lib/livekitLiveSignaling');
        await publishStreamEnded(streamId, { endedBy: 'host', reason: 'lifecycle' });
      } catch (e) {
        console.warn('[LiveStream Lifecycle] stream_ended packet failed:', e);
      }

      const { error } = await supabase.rpc('close_live_stream_now' as any, {
        p_stream_id: streamId,
      });
      
      if (error) {
        console.error('[LiveStream Lifecycle] close_live_stream_now failed:', error);
        const { error: fallbackCloseError } = await supabase
          .from('live_streams')
          .update({ is_active: false, ended_at: new Date().toISOString(), viewer_count: 0 } as any)
          .eq('id', streamId);
        if (fallbackCloseError) console.error('[LiveStream Lifecycle] fallback close failed:', fallbackCloseError);
        // Fallback: keepalive RPC with user token for page unload scenarios.
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/close_live_stream_now`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': getSupabasePublishableKey(),
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ p_stream_id: streamId }),
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
      let rawSession = '{}';
      if (authStorageKey) {
        try { rawSession = localStorage.getItem(authStorageKey) || '{}'; } catch { rawSession = '{}'; }
      }
      const session = JSON.parse(rawSession);
      const token = session?.access_token;
      if (token) {
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/close_live_stream_now`, {
            'Content-Type': 'application/json',
            'apikey': getSupabasePublishableKey(),
            'Authorization': `Bearer ${token}`,
          },
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
      // CRITICAL FIX (Phase 1 audit): DB function signature is
      // `update_stream_heartbeat(_stream_id uuid)` — leading underscore.
      // PostgREST resolves named args by parameter name, so passing
      // `{ stream_id }` always failed silently (PGRST202) and the server
      // cron auto-closed every stream after 3 minutes. Must use `_stream_id`.
      try {
        const { error } = await supabase.rpc('update_stream_heartbeat', { _stream_id: streamId } as any);
        if (error) console.error('[LiveStream Lifecycle] Heartbeat RPC error:', error);
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

    // ============ WEB HANDLING (Pkg426 + GAP-8) ============
    // PROFESSIONAL LIVE STREAMING PATTERN (Bigo/Tango/Chamet):
    // Host stream NEVER ends from `pagehide` / `beforeunload`. iOS Safari and
    // Android WebView fire these on tab switch, notification shade, permission
    // dialog, scroll-to-address-bar — auto-killing the stream caused the
    // "2–15 second random cut" the user reported.
    //
    // Truth source for "stream still alive" = host heartbeat every 15s.
    // GAP-8: on true document unload (tab close/reload), use keepalive RPC so
    // abandoned web hosts do not leave a multi-minute ghost stream. Do NOT use
    // pagehide/visibilitychange because those fire on mobile app switch and
    // would randomly kill active broadcasts.
    window.addEventListener('beforeunload', forceEndStreamSync);
    return () => {
      window.removeEventListener('beforeunload', forceEndStreamSync);
      cleanupRef.current?.();
    };
  }, [streamId, isHost, isHostVerified, forceEndStream, forceEndStreamSync]);

  return {
    forceEndStream,
    hasEnded: hasEndedRef.current,
  };
};

export default useLiveStreamLifecycle;
