/**
 * CreatePhase — wraps the existing CreateParty page.
 *
 * Eager-imported so phase swaps never insert a Suspense null fallback
 * between CreateParty's preview and PartyRoom's LiveKit surface. The
 * camera handoff is back-stopped by the Provider's persistent camera
 * refcount and the persistent camera surface.
 */
import CreateParty from '@/pages/CreateParty';

export default function CreatePhase() {
  return <CreateParty />;
}
