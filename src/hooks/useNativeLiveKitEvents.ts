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
  /** OEM Camera2 open/retry state from native Android. */
  onCameraState?: (state: 'started' | 'failed', reason: string, error?: string) => void;
  /** Per-track decoded-frame watchdog event. */
  onVideoStall?: (state: 'stalled' | 'failed', isLocal: boolean, sid: string) => void;
  /** Activity entered or left PiP mode. */
  onPipChanged?: (isInPip: boolean) => void;
  /** Signal/connection quality class for UI. */
  onSignalQuality?: (quality: string) => void;
}

/**
 * N3e — Bridge config. When passed, the hook also listens to the native
 * `active-speakers-changed` / `participant-metadata-changed` /
 * `room-metadata-changed` / `transcription-received` events and re-dispatches
 * them as the SAME `livekit-active-speakers` / `livekit-participant-metadata`
 * / `livekit-room-metadata` / `livekit-transcription` window CustomEvents the
 * existing React consumer hooks already listen for. Lets all four LiveKit
 * features work on native sessions without per-feature refactor.
 */
export interface NativeLiveKitBridgeOptions {
  scope: 'call' | 'live' | 'party';
  id: string;
}


/**
 * @param active  Only register listeners when the native session is in use.
 * @param handlers Optional callbacks. Stable refs preferred — captured once.
 * @param bridge   Optional N3e bridge config (scope + id). When provided,
 *                 native room/participant events are forwarded as the same
 *                 window CustomEvents the JS-Room modules already emit.
 */
export function useNativeLiveKitEvents(
  active: boolean,
  handlers: NativeLiveKitEventHandlers = {},
  bridge?: NativeLiveKitBridgeOptions,
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const bridgeRef = useRef(bridge);
  bridgeRef.current = bridge;

  useEffect(() => {
    if (!active || !isNativeLiveKitAvailable()) return;

    const subs: PluginListenerHandle[] = [];
    let cancelled = false;

    const attachAllRemoteSurfaces = () => {
      if (cancelled) return;
      nativeLiveKitController.attachAllRemotes().catch(() => {});
    };

    const attachLocalSurface = () => {
      if (cancelled) return;
      if (!nativeLiveKitController.canAttachFullscreenLocal()) return;
      nativeLiveKitController.attachLocal().catch(() => {});
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
          if (e.sid === 'local' || !e.sid) {
            handlersRef.current.onSignalQuality?.(e.quality);
          }
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
            setTimeout(attachLocalSurface, 40);
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

        const cameraState = await NativeLiveKit.addListener('camera-state', (e) => {
          handlersRef.current.onCameraState?.(e.state, e.reason, e.error);
          if (e.state === 'started') {
            setTimeout(attachLocalSurface, 40);
            setTimeout(attachAllRemoteSurfaces, 80);
            setTimeout(attachAllRemoteSurfaces, 300);
          }
        });
        if (cancelled) { cameraState.remove(); return; }
        subs.push(cameraState);

        const videoStall = await NativeLiveKit.addListener('video-stall', (e) => {
          handlersRef.current.onVideoStall?.(e.state, e.isLocal, e.sid);
          if (e.state === 'failed') {
            setTimeout(attachAllRemoteSurfaces, 120);
            setTimeout(attachAllRemoteSurfaces, 450);
          }
        });
        if (cancelled) { videoStall.remove(); return; }
        subs.push(videoStall);

        const pipChanged = await NativeLiveKit.addListener('pip-changed', (e) => {
          handlersRef.current.onPipChanged?.(e.isInPip);
        });
        if (cancelled) { pipChanged.remove(); return; }
        subs.push(pipChanged);

        // Phase I.b — music-mode headphone soft warning. Native fires this
        // right after connect when audioProfile='music' and no wired/BT
        // headset is detected. We bridge it to a window CustomEvent so the
        // host UI (LiveStream / Party) can show its existing toast vocab
        // without coupling this hook to a specific toast library.
        const musicHeadset = await NativeLiveKit.addListener(
          'music-headphone-warning' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:music-headphone-warning', {
                detail: { reason: e?.reason, message: e?.message },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { musicHeadset.remove(); return; }
        subs.push(musicHeadset);

        // Phase I.b — Live HOST background 60s grace period (Bigo/Chamet
        // standard). Native pauses camera and starts a timer; if the host
        // returns the timer is cancelled and camera resumes. We forward
        // start/end as window CustomEvents so the host overlay (if any)
        // can render a countdown without touching native code.
        const graceStart = await NativeLiveKit.addListener(
          'live-host-grace-start' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:live-host-grace-start', {
                detail: { endsAtMs: e?.endsAtMs, graceMs: e?.graceMs },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { graceStart.remove(); return; }
        subs.push(graceStart);

        const graceEnd = await NativeLiveKit.addListener(
          'live-host-grace-end' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:live-host-grace-end', {
                detail: { reason: e?.reason },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { graceEnd.remove(); return; }
        subs.push(graceEnd);

        // N3e — Native → window CustomEvent bridge for the 4 metadata-class
        // RoomEvents (active speakers, participant metadata, room metadata,
        // transcription). Mirrors the detail shapes already produced by the
        // JS-Room registrars in livekitActiveSpeaker / livekitMetadata /
        // livekitRoomMetadata / livekitTranscription, so existing consumer
        // React hooks `just work` on native sessions.
        const getBridge = () => bridgeRef.current;

        const activeSpeakers = await NativeLiveKit.addListener(
          'active-speakers-changed' as any,
          (e: any) => {
            const b = getBridge(); if (!b) return;
            try {
              const identities: string[] = [];
              const levels: Record<string, number> = {};
              for (const s of (e?.speakers ?? [])) {
                if (!s?.identity) continue;
                identities.push(s.identity);
                levels[s.identity] = typeof s.audioLevel === 'number' ? s.audioLevel : 0;
              }
              window.dispatchEvent(new CustomEvent('livekit-active-speakers', {
                detail: { scope: b.scope, id: b.id, identities, levels },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { activeSpeakers.remove(); return; }
        subs.push(activeSpeakers);

        const safeParseJson = (raw: string | undefined): Record<string, unknown> | null => {
          if (!raw) return null;
          try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v : null; }
          catch { return null; }
        };

        const participantMeta = await NativeLiveKit.addListener(
          'participant-metadata-changed' as any,
          (e: any) => {
            const b = getBridge(); if (!b) return;
            try {
              window.dispatchEvent(new CustomEvent('livekit-participant-metadata', {
                detail: {
                  scope: b.scope,
                  id: b.id,
                  identity: e?.identity ?? '',
                  metadata: safeParseJson(e?.metadata),
                  raw: e?.metadata,
                },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { participantMeta.remove(); return; }
        subs.push(participantMeta);

        const roomMeta = await NativeLiveKit.addListener(
          'room-metadata-changed' as any,
          (e: any) => {
            const b = getBridge(); if (!b) return;
            try {
              const raw: string = e?.metadata ?? '';
              window.dispatchEvent(new CustomEvent('livekit-room-metadata', {
                detail: {
                  scope: b.scope,
                  id: b.id,
                  raw,
                  metadata: safeParseJson(raw),
                },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { roomMeta.remove(); return; }
        subs.push(roomMeta);

        const transcription = await NativeLiveKit.addListener(
          'transcription-received' as any,
          (e: any) => {
            const b = getBridge(); if (!b) return;
            try {
              const segs = (e?.segments ?? []).map((s: any) => ({
                id: s.id,
                text: s.text,
                language: s.language,
                final: !!s.final,
                // Native exposes firstReceivedTime/lastReceivedTime (long, ms);
                // forward as start/end for parity with the JS-Room schema.
                startTime: typeof s.firstReceivedTime === 'number' ? s.firstReceivedTime : undefined,
                endTime: typeof s.lastReceivedTime === 'number' ? s.lastReceivedTime : undefined,
              }));
              window.dispatchEvent(new CustomEvent('livekit-transcription', {
                detail: {
                  scope: b.scope,
                  id: b.id,
                  roomName: b.id,
                  identity: e?.participantIdentity || undefined,
                  segments: segs,
                },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { transcription.remove(); return; }
        subs.push(transcription);

        // N3b — participant display-name changes. Native-only path until a
        // JS consumer subscribes to `livekit-participant-name`; emitting it
        // keeps parity with the other 4 metadata-class events.
        const participantName = await NativeLiveKit.addListener(
          'participant-name-changed' as any,
          (e: any) => {
            const b = getBridge(); if (!b) return;
            try {
              window.dispatchEvent(new CustomEvent('livekit-participant-name', {
                detail: {
                  scope: b.scope,
                  id: b.id,
                  sid: e?.sid ?? '',
                  identity: e?.identity ?? '',
                  name: e?.name ?? '',
                },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { participantName.remove(); return; }
        subs.push(participantName);

        // F-5.4 — SFU rejected the current JWT (DisconnectReason.TOKEN_EXPIRED).
        // Hard-reconnect with a stale JWT would re-fail, so the token-refresh
        // helper listens for this window event and triggers fetch + reconnectNow.
        const tokenExpired = await NativeLiveKit.addListener(
          'token-expired' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:token-expired', {
                detail: { reason: e?.reason ?? 'token-expired' },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { tokenExpired.remove(); return; }
        subs.push(tokenExpired);

        // F-6.1 — local-mic VAD transition (smoothed, 500ms silence hold).
        // BGM players (PartyMusicPlayer) duck to ~-20dB while speaking:true.
        const localVad = await NativeLiveKit.addListener(
          'local-vad-changed' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:local-vad-changed', {
                detail: { speaking: !!e?.speaking, level: typeof e?.level === 'number' ? e.level : 0 },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { localVad.remove(); return; }
        subs.push(localVad);

        // F-6.2 — per-participant audio levels (150ms poll) for seat ring pulse.
        const seatLevels = await NativeLiveKit.addListener(
          'seat-audio-levels' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:seat-audio-levels', {
                detail: { levels: e?.levels ?? {} },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { seatLevels.remove(); return; }
        subs.push(seatLevels);

        // F-6.1 — BT SCO request rejected because audioProfile=music
        // (SCO caps at 16 kHz). Native fell back to speaker; surface for UI toast.
        const routeBlocked = await NativeLiveKit.addListener(
          'audio-route-blocked' as any,
          (e: any) => {
            try {
              window.dispatchEvent(new CustomEvent('lk:audio-route-blocked', {
                detail: { reason: e?.reason, requested: e?.requested, fallback: e?.fallback },
              }));
            } catch { /* noop */ }
          },
        );
        if (cancelled) { routeBlocked.remove(); return; }
        subs.push(routeBlocked);





      } catch (err) {
        console.warn('[useNativeLiveKitEvents] listener registration failed:', err);
        if (cancelled) {
          for (const s of subs) {
            try { s.remove(); } catch { /* noop */ }
          }
          subs.length = 0;
        }
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
