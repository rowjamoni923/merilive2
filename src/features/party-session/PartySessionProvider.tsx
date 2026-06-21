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
 * Unlike Live, the Provider deliberately does NOT acquire a camera
 * refcount itself — party rooms support audio-only and the existing
 * `preserveStreamRef` + native `LiveKitPlugin.startLocalPreview` handoff
 * in CreateParty/PartyRoom already keeps the camera continuous across
 * the swap. Adding a refcount here would double-acquire on audio rooms.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

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
