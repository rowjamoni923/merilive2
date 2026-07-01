/**
 * BroadcastPhase — wraps the existing LiveStream page (host view).
 *
 * Eager-imported (no lazy/Suspense). The Provider holds the camera
 * refcount and a PersistentCameraSurface paints the warm MediaStream
 * behind the phase UI, so the preview→broadcast swap is a seamless DOM
 * exchange with no camera restart and no visible black gap.
 */
import LiveStream from '@/pages/LiveStream';

export default function BroadcastPhase() {
  return <LiveStream />;
}
