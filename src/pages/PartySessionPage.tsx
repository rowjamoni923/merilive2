/**
 * PartySessionPage
 * ----------------
 * Single route handler for the entire party flow. Mirrors LiveSessionPage:
 * one PartySessionProvider survives every phase transition; the active
 * phase decides which UI subtree mounts.
 *
 * Query params (optional, used for backward-compat deep links):
 *   ?phase=create|inRoom|ended
 *   ?room=<party-room-id>          (when entering directly into a room)
 */
import { useSearchParams } from 'react-router-dom';
import {
  PartySessionProvider,
  usePartySession,
  CreatePhase,
  InRoomPhase,
  EndedPhase,
  type PartySessionPhase,
} from '@/features/party-session';

function PhaseSwitch() {
  const { phase } = usePartySession();
  switch (phase) {
    case 'inRoom':
      return <InRoomPhase />;
    case 'ended':
      return <EndedPhase />;
    case 'create':
    default:
      return <CreatePhase />;
  }
}

export default function PartySessionPage() {
  const [params] = useSearchParams();
  const phaseParam = params.get('phase') as PartySessionPhase | null;
  const roomParam = params.get('room');

  const initialPhase: PartySessionPhase =
    phaseParam === 'inRoom' || phaseParam === 'ended' || phaseParam === 'create'
      ? phaseParam
      : 'create';

  return (
    <PartySessionProvider
      initialPhase={initialPhase}
      initialRoomId={roomParam}
    >
      <PhaseSwitch />
    </PartySessionProvider>
  );
}
