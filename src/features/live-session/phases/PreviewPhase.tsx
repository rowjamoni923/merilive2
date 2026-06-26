/**
 * PreviewPhase — wraps the existing GoLive page.
 *
 * Eager-imported (no lazy/Suspense) so that swapping between PreviewPhase
 * and BroadcastPhase never inserts a `null` fallback render. Combined with
 * the persistent camera surface and persistentCameraSession refcount, the
 * camera surface stays continuously visible across the swap — no black
 * flash, no apparent "re-open".
 */
import GoLive from '@/pages/GoLive';

export default function PreviewPhase() {
  return <GoLive />;
}
