/**
 * BroadcastPhase — wraps the existing LiveStream page (host view).
 *
 * Mounted only after the host taps "Go Live" and a stream row exists. Because
 * LiveSessionProvider holds the camera refcount, the swap from PreviewPhase
 * to BroadcastPhase does not release the camera or restart the LiveKit
 * preview track.
 */
import { lazy, Suspense } from 'react';

const LiveStream = lazy(() => import('@/pages/LiveStream'));

export default function BroadcastPhase() {
  return (
    <Suspense fallback={null}>
      <LiveStream />
    </Suspense>
  );
}
