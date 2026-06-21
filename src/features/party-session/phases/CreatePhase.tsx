/**
 * CreatePhase — wraps the existing CreateParty page.
 *
 * CreateParty reads usePartySessionOptional() and, when present, calls
 * `goToInRoom(roomId, mode)` instead of `navigate(/party/:id)`. The
 * Provider stays mounted, so PartyRoom mounts in the same React tree
 * and the native LiveKit prejoin preview is handed off without a
 * route change.
 */
import { lazy, Suspense } from 'react';

const CreateParty = lazy(() => import('@/pages/CreateParty'));

export default function CreatePhase() {
  return (
    <Suspense fallback={null}>
      <CreateParty />
    </Suspense>
  );
}
