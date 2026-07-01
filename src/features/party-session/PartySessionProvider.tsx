/**
 * PartySessionProvider — Delivery 2, mirror of LiveSessionProvider.
 *
 * One parent container survives the entire party flow:
 *   create → inRoom → ended
 *
 * Phase transitions are local React state, so CreateParty's mic/camera
 * preview and PartyRoom's LiveKit session swap in the same tree without
 * a route navigation. No WebView reload, no native plugin "page gone".
 *
 * Pkg-shirt Phase-A (web): the Provider now ALSO holds a global
 * persistentCameraSession refcount during the `inRoom` phase for video /
 * game modes. CreateParty adopts the getUserMedia stream into the same
 * session on mount, so during the React unmount→mount window between
 * CreatePhase and InRoomPhase, the stream is back-stopped by this
 * Provider-held refcount and never re-`getUserMedia`'d. Audio-only
 * party rooms still skip the refcount (no camera needed).
 *
 * Native Android path is unaffected — LiveKitPlugin.startLocalPreview /
 * promotePreviewToSession already handles the Camera2 handoff there.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  acquireCameraSession,
  type CameraSessionHandle,
} from '@/lib/persistentCameraSession';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

export type PartySessionPhase = 'create' | 'inRoom' | 'ended';
export type PartyMode = 'audio' | 'video' | 'game';

export type PartySessionContextValue = {
  phase: PartySessionPhase;
  setPhase: (next: PartySessionPhase) => void;
  roomId: string | null;
  setRoomId: (id: string | null) => void;
  mode: PartyMode | null;
  /** Called by CreateParty after `create_party_room` rpc succeeds. */
  goToInRoom: (roomId: string, mode: PartyMode) => void;
  /** Called by PartyRoom when the host closes or the user leaves. */
  goToEnded: () => void;
};

const PartySessionContext = createContext<PartySessionContextValue | null>(null);

export function PartySessionProvider({
  initialPhase = 'create',
  initialRoomId = null,
  children,
}: {
  initialPhase?: PartySessionPhase;
  initialRoomId?: string | null;
  children: ReactNode;
}) {
  const [phase, setPhaseState] = useState<PartySessionPhase>(initialPhase);
  const [roomId, setRoomId] = useState<string | null>(initialRoomId);
  const [mode, setMode] = useState<PartyMode | null>(null);

  // Pkg-shirt Phase-A: video/game inRoom safety-net refcount.
  const cameraHandleRef = useRef<CameraSessionHandle | null>(null);

  useEffect(() => {
    // Native Android party/video/game handoff is owned by LiveKitPlugin's
    // Camera2 preview promotion. Never open a parallel WebView camera here.
    if (isNativeAndroidApp()) return;

    const needsCamera = phase === 'inRoom' && (mode === 'video' || mode === 'game');
    if (!needsCamera) {
      // Release any held handle when leaving inRoom or when mode is audio.
      const h = cameraHandleRef.current;
      cameraHandleRef.current = null;
      if (h) {
        try { h.release(); } catch { /* noop */ }
      }
      return;
    }
    if (cameraHandleRef.current) return; // already held
    let cancelled = false;
    (async () => {
      try {
        const handle = await acquireCameraSession({ video: true, audio: true });
        if (cancelled) {
          handle.release();
          return;
        }
        cameraHandleRef.current = handle;
      } catch (err) {
        // Non-fatal: CreateParty's own handle + preparedHostPreviewStream
        // still mediates the swap. This is purely a safety-net.
        console.warn('[PartySession] camera safety-net acquire failed', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, mode]);

  // Final cleanup on Provider unmount.
  useEffect(() => {
    return () => {
      const h = cameraHandleRef.current;
      cameraHandleRef.current = null;
      if (h) {
        try { h.release(); } catch { /* noop */ }
      }
    };
  }, []);

  const setPhase = useCallback((next: PartySessionPhase) => {
    setPhaseState((prev) => (prev === next ? prev : next));
  }, []);

  const goToInRoom = useCallback((id: string, m: PartyMode) => {
    setRoomId(id);
    setMode(m);
    setPhaseState('inRoom');
  }, []);

  const goToEnded = useCallback(() => {
    setPhaseState('ended');
  }, []);

  const value = useMemo<PartySessionContextValue>(
    () => ({
      phase,
      setPhase,
      roomId,
      setRoomId,
      mode,
      goToInRoom,
      goToEnded,
    }),
    [phase, setPhase, roomId, mode, goToInRoom, goToEnded],
  );

  return (
    <PartySessionContext.Provider value={value}>
      {/* Global PersistentCameraSurface lives in CallProvider — see
          src/components/media/PersistentCameraSurface.tsx. It bridges
          every route swap (create → in-room) without unmounting. */}
      {children}
    </PartySessionContext.Provider>
  );
}

export function usePartySession(): PartySessionContextValue {
  const ctx = useContext(PartySessionContext);
  if (!ctx) {
    throw new Error('usePartySession must be used inside <PartySessionProvider>');
  }
  return ctx;
}

export function usePartySessionOptional(): PartySessionContextValue | null {
  return useContext(PartySessionContext);
}
