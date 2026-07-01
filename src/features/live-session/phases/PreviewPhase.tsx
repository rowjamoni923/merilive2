/**
 * PreviewPhase — wraps the existing GoLive page.
 *
 * Eager-imported (no lazy/Suspense) so swapping between PreviewPhase and
 * BroadcastPhase never inserts a blank fallback. Camera rendering stays owned
 * by the visible page only.
 */
import GoLive from '@/pages/GoLive';

export default function PreviewPhase() {
  return <GoLive />;
}
