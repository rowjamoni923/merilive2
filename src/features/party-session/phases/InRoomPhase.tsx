/**
 * InRoomPhase — wraps the existing PartyRoom page.
 *
 * PartyRoom reads its roomId from usePartySessionOptional() first and
 * falls back to useParams when rendered standalone (deep-link / invite
 * push). End-of-session callbacks route to `goToEnded()` instead of
 * navigating away, keeping the Provider mounted for the EndedPhase.
 */
import { lazy, Suspense } from 'react';

const PartyRoom = lazy(() => import('@/pages/PartyRoom'));

export default function InRoomPhase() {
  return (
    <Suspense fallback={null}>
      <PartyRoom />
    </Suspense>
  );
}
