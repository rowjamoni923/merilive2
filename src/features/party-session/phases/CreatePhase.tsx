/**
 * CreatePhase — wraps the existing CreateParty page.
 *
 * Eager-imported so phase swaps never insert a Suspense null fallback.
 * Camera rendering stays owned by the visible page only.
 */
import CreateParty from '@/pages/CreateParty';

export default function CreatePhase() {
  return <CreateParty />;
}
