/**
 * useNativeLiveKit — React hook wrapper around the Capacitor NativeLiveKit plugin.
 *
 * Provides a stable, declarative API for Live broadcaster + Private Call
 * native paths (Android). Web / iOS callers fall back to the existing
 * livekit-client / Agora flow — this hook simply reports `available: false`
 * so the caller can branch.
 *
 * Lifecycle:
 *   const lk = useNativeLiveKit();
 *   await lk.connect({ url, token, lens: 'front', resolution: '1080p' });
 *   await lk.attachLocal();           // mount native preview behind WebView
 *   await lk.attachRemote(remoteSid); // mount remote video behind WebView
 *   await lk.disconnect();            // auto-runs on unmount too
 *
 * All event handlers are subscribed on mount and unsubscribed on unmount.
 * `state` re-renders whenever connection/participants change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  NativeLiveKit,
  isNativeLiveKitAvailable,
  type ConnectOptions,
  type Lens,
  type Resolution,
  type ParticipantEvent,
  type TrackEvent,
  type DisconnectedEvent,
  type QualityEvent,
} from '@/plugins/NativeLiveKit';

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface RemotePeer {
  sid: string;
  identity: string;
  hasVideo: boolean;
  hasAudio: boolean;
  quality?: string;
}

export interface NativeLiveKitState {
  available: boolean;
  state: ConnectionState;
  localSid: string;
  localIdentity: string;
  remotes: Record<string, RemotePeer>;
  lastError?: string;
  lastDisconnectReason?: string;
}

export interface NativeLiveKitApi extends NativeLiveKitState {
  connect: (opts: ConnectOptions) => Promise<boolean>;
  disconnect: () => Promise<void>;
  setMicrophoneEnabled: (enabled: boolean) => Promise<void>;
  setCameraEnabled: (enabled: boolean) => Promise<void>;
  switchCamera: () => Promise<void>;
  attachLocal: () => Promise<void>;
  attachRemote: (sid: string) => Promise<void>;
  detachAll: () => Promise<void>;
}

export function useNativeLiveKit(): NativeLiveKitApi {
  const available = useMemo(() => isNativeLiveKitAvailable(), []);

  const [state, setState] = useState<ConnectionState>('idle');
  const [localSid, setLocalSid] = useState('');
  const [localIdentity, setLocalIdentity] = useState('');
  const [remotes, setRemotes] = useState<Record<string, RemotePeer>>({});
  const [lastError, setLastError] = useState<string | undefined>();
  const [lastDisconnectReason, setLastDisconnectReason] = useState<string | undefined>();

  const listenersRef = useRef<PluginListenerHandle[]>([]);
  const mountedRef = useRef(true);

  // ---- Listener setup (only when native available) ----
  useEffect(() => {
    if (!available) return;
    mountedRef.current = true;

    const handles: PluginListenerHandle[] = [];

    const upsertRemote = (e: ParticipantEvent, patch: Partial<RemotePeer> = {}) => {
      if (!mountedRef.current || !e.sid) return;
      setRemotes(prev => ({
        ...prev,
        [e.sid]: {
          sid: e.sid,
          identity: e.identity,
          hasVideo: prev[e.sid]?.hasVideo ?? false,
          hasAudio: prev[e.sid]?.hasAudio ?? false,
          quality: prev[e.sid]?.quality,
          ...patch,
        },
      }));
    };

    const setup = async () => {
      handles.push(
        await NativeLiveKit.addListener('participant-connected', (e: ParticipantEvent) => {
          upsertRemote(e);
        }),
      );
      handles.push(
        await NativeLiveKit.addListener('participant-disconnected', (e: ParticipantEvent) => {
          if (!mountedRef.current) return;
          setRemotes(prev => {
            if (!prev[e.sid]) return prev;
            const next = { ...prev };
            delete next[e.sid];
            return next;
          });
        }),
      );
      handles.push(
        await NativeLiveKit.addListener('track-subscribed', (e: TrackEvent) => {
          upsertRemote(e, e.kind === 'video' ? { hasVideo: true } : { hasAudio: true });
        }),
      );
      handles.push(
        await NativeLiveKit.addListener('track-unsubscribed', (e: TrackEvent) => {
          upsertRemote(e, e.kind === 'video' ? { hasVideo: false } : { hasAudio: false });
        }),
      );
      handles.push(
        await NativeLiveKit.addListener('connection-quality', (e: QualityEvent) => {
          if (!mountedRef.current || !e.sid) return;
          setRemotes(prev =>
            prev[e.sid] ? { ...prev, [e.sid]: { ...prev[e.sid], quality: e.quality } } : prev,
          );
        }),
      );
      handles.push(
        await NativeLiveKit.addListener('disconnected', (e: DisconnectedEvent) => {
          if (!mountedRef.current) return;
          setState('disconnected');
          setLastDisconnectReason(e.reason);
          setRemotes({});
        }),
      );
      listenersRef.current = handles;
    };

    setup().catch(err => {
      console.error('[useNativeLiveKit] listener setup failed', err);
    });

    return () => {
      mountedRef.current = false;
      for (const h of listenersRef.current) {
        try { h.remove(); } catch { /* ignore */ }
      }
      listenersRef.current = [];
      // Best-effort native cleanup on unmount.
      NativeLiveKit.disconnect().catch(() => undefined);
    };
  }, [available]);

  // ---- Wrapped API ----
  const connect = useCallback(
    async (opts: ConnectOptions): Promise<boolean> => {
      if (!available) return false;
      setState('connecting');
      setLastError(undefined);
      setLastDisconnectReason(undefined);
      try {
        const res = await NativeLiveKit.connect(opts);
        if (!mountedRef.current) return res.connected;
        setLocalSid(res.sid);
        setLocalIdentity(res.identity);
        setState(res.connected ? 'connected' : 'disconnected');
        return res.connected;
      } catch (err: any) {
        if (mountedRef.current) {
          setState('error');
          setLastError(err?.message ?? String(err));
        }
        return false;
      }
    },
    [available],
  );

  const disconnect = useCallback(async () => {
    if (!available) return;
    try { await NativeLiveKit.disconnect(); } catch { /* ignore */ }
    if (mountedRef.current) {
      setState('disconnected');
      setRemotes({});
      setLocalSid('');
      setLocalIdentity('');
    }
  }, [available]);

  const guarded = <T extends (...a: any[]) => Promise<any>>(fn: T) =>
    (async (...args: Parameters<T>) => {
      if (!available) return;
      try { return await fn(...args); }
      catch (err: any) {
        if (mountedRef.current) setLastError(err?.message ?? String(err));
        throw err;
      }
    }) as T;

  const setMicrophoneEnabled = useCallback(
    guarded(async (enabled: boolean) => { await NativeLiveKit.setMicrophoneEnabled({ enabled }); }),
    [available],
  );
  const setCameraEnabled = useCallback(
    guarded(async (enabled: boolean) => { await NativeLiveKit.setCameraEnabled({ enabled }); }),
    [available],
  );
  const switchCamera = useCallback(
    guarded(async () => { await NativeLiveKit.switchCamera(); }),
    [available],
  );
  const attachLocal = useCallback(
    guarded(async () => { await NativeLiveKit.attachLocal(); }),
    [available],
  );
  const attachRemote = useCallback(
    guarded(async (sid: string) => { await NativeLiveKit.attachRemote({ sid }); }),
    [available],
  );
  const detachAll = useCallback(
    guarded(async () => { await NativeLiveKit.detachAll(); }),
    [available],
  );

  return {
    available,
    state,
    localSid,
    localIdentity,
    remotes,
    lastError,
    lastDisconnectReason,
    connect,
    disconnect,
    setMicrophoneEnabled,
    setCameraEnabled,
    switchCamera,
    attachLocal,
    attachRemote,
    detachAll,
  };
}

// Re-export common types so consumers only import from this hook.
export type { Lens, Resolution, ConnectOptions };
