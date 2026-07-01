/**
 * BroadcastPhase — wraps the existing LiveStream page (host view).
 *
 * Eager-imported (no lazy/Suspense). The visible LiveStream screen owns
 * camera rendering; no global background camera surface is mounted here.
 */
import LiveStream from '@/pages/LiveStream';

export default function BroadcastPhase() {
  return <LiveStream />;
}
