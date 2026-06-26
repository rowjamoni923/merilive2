/**
 * InRoomPhase — wraps the existing PartyRoom page.
 *
 * Eager-imported (no lazy/Suspense) so the create→inRoom swap never
 * inserts a `null` fallback. PartyRoom reads roomId from
 * usePartySessionOptional() first and falls back to useParams when
 * rendered standalone (deep-link / invite push).
 */
import PartyRoom from '@/pages/PartyRoom';

export default function InRoomPhase() {
  return <PartyRoom />;
}
