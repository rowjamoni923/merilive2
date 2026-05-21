/**
 * useNativeLiveKitEvents — subscribes to NativeLiveKit plugin events while
 * a native session is active and:
 *   1. Auto-attaches remote VIDEO tracks via the controller (so private-call
 *      peers and live viewers see the other side without extra plumbing).
 *   2. Surfaces native-side disconnect / connection-quality to React so the
 *      existing leave/cleanup logic can run.
 *
 * Web/iOS callers pass `active=false` (gate already returned false) and the
 * hook becomes a no-op — no listeners registered, zero plugin contact.
 */
import { useEffect, useRef } from 'react';
import { NativeLiveKit, isNativeLiveKitAvailable } from '@/plugins/NativeLiveKit';
import type { PluginListenerHandle } from '@capacitor/core';
import { nativeLiveKitController } from '@/lib/nativeLiveKitController';

export interface NativeLiveKitEventHandlers {
  /** Native session dropped (network loss, server disconnect, host ended). */
  onDisconnected?: (reason: string) => void;
  /** Connection quality changed for any participant. */
  onQualityChanged?: (sid: string, quality: string) => void;
  /** A remote participant joined. */
  onParticipantConnected?: (sid: string, identity: string) => void;
  /** A remote participant left. */
  onParticipantDisconnected?: (sid: string, identity: string) => void;
  /** Step 18/26 — connection lifecycle: transient reconnect, hard reconnect, or permanent loss. */
  onConnectionState?: (state: 'reconnecting' | 'reconnected' | 'degraded' | 'reconnect-failed' | 'lost') => void;
  /** Step 18 — system audio focus lost/regained (PSTN call, alarm, navigation prompt, etc.). */
  onAudioInterruption?: (state: 'loss' | 'gain', permanent: boolean) => void;
}

/**
 * @param active  Only register listeners when the native session is in use.
 * @param handlers Optional callbacks. Stable refs preferred — captured once.
 */
export function useNativeLiveKitEvents(
  active: boolean,
  handlers: NativeLiveKitEventHandlers = {},
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!active || !isNativeLiveKitAvailable()) return;

    const subs: PluginListenerHandle[] = [];
    let cancelled = false;

    const attachAllRemoteSurfaces = () => {
      if (cancelled) return;
      nativeLiveKitController.attachAllRemotes().catch(() => {});
    };

    const register = async () => {
      try {
        const trackSubscribed = await NativeLiveKit.addListener('track-subscribed', (e) => {
          // Auto-attach incoming video so the React layer never has to.
          if (e.kind === 'video') {
            nativeLiveKitController.attachRemote(e.sid).catch(() => {});
            attachAllRemoteSurfaces();
          }
        });
        if (cancelled) { trackSubscribed.remove(); return; }
        subs.push(trackSubscribed);

        const disconnected = await NativeLiveKit.addListener('disconnected', (e) => {
          handlersRef.current.onDisconnected?.(e?.reason ?? 'unknown');
        });
        if (cancelled) { disconnected.remove(); return; }
        subs.push(disconnected);

        const quality = await NativeLiveKit.addListener('connection-quality', (e) => {
          handlersRef.current.onQualityChanged?.(e.sid, e.quality);
        });
        if (cancelled) { quality.remove(); return; }
        subs.push(quality);

        const pConnected = await NativeLiveKit.addListener('participant-connected', (e) => {
          handlersRef.current.onParticipantConnected?.(e.sid, e.identity);
          nativeLiveKitController.attachRemote(e.sid).catch(() => {});
          setTimeout(attachAllRemoteSurfaces, 80);
          setTimeout(attachAllRemoteSurfaces, 250);
        });
        if (cancelled) { pConnected.remove(); return; }
        subs.push(pConnected);

        const pDisconnected = await NativeLiveKit.addListener('participant-disconnected', (e) => {
          handlersRef.current.onParticipantDisconnected?.(e.sid, e.identity);
        });
        if (cancelled) { pDisconnected.remove(); return; }
        subs.push(pDisconnected);

        // Step 18 — transient reconnect lifecycle (network drop recovery).
        const connState = await NativeLiveKit.addListener('connection-state', (e) => {
          handlersRef.current.onConnectionState?.(e.state);
          if (e.state === 'reconnected') {
            setTimeout(attachAllRemoteSurfaces, 80);
            setTimeout(attachAllRemoteSurfaces, 250);
          }
        });
        if (cancelled) { connState.remove(); return; }
        subs.push(connState);

        // Step 18 — system audio focus loss/gain (PSTN, alarm, voice assistant).
        const audioInt = await NativeLiveKit.addListener('audio-interruption', (e) => {
          handlersRef.current.onAudioInterruption?.(e.state, e.permanent);
        });
        if (cancelled) { audioInt.remove(); return; }
        subs.push(audioInt);
      } catch (err) {
        console.warn('[useNativeLiveKitEvents] listener registration failed:', err);
      }
    };

    register();
    attachAllRemoteSurfaces();
    setTimeout(attachAllRemoteSurfaces, 120);
    setTimeout(attachAllRemoteSurfaces, 400);

    return () => {
      cancelled = true;
      for (const s of subs) {
        try { s.remove(); } catch { /* noop */ }
      }
    };
  }, [active]);
}
