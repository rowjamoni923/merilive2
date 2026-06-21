/**
 * PreviewPhase — wraps the existing GoLive page.
 *
 * For Step 1 this re-uses GoLive as-is; because LiveSessionProvider holds a
 * camera refcount, GoLive's own acquireCameraSession() call simply increments
 * the existing refcount instead of opening a fresh stream.
 *
 * Future steps will inline GoLive's UI here and let LiveSessionProvider own
 * the LiveKit preview track directly.
 */
import { lazy, Suspense } from 'react';

const GoLive = lazy(() => import('@/pages/GoLive'));

export default function PreviewPhase() {
  return (
    <Suspense fallback={null}>
      <GoLive />
    </Suspense>
  );
}
