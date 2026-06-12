/**
 * useViewerSession — auto-manage the Android viewer-side foreground
 * service for the duration of a live/party VIEWER session.
 *
 * Mount this hook on viewer screens (live audience, party listener,
 * non-publishing party member). DO NOT mount on host/publisher screens
 * — CallForegroundService already covers the publisher with a camera +
 * microphone FGS started from LiveKitPlugin.connect().
 *
 * Web / iOS: no-op. Repeated start calls are idempotent because the
 * native service uses a stable notification id.
 */
import { useEffect } from 'react';
import {
  isViewerSessionAvailable,
  startViewerSession,
  stopViewerSession,
  type ViewerSessionKind,
} from '@/plugins/ViewerSession';

export interface UseViewerSessionOptions {
  /** When false the session is torn down. Use this to gate by route + role. */
  active: boolean;
  kind: ViewerSessionKind;
  title?: string;
  subtitle?: string;
}

export function useViewerSession({ active, kind, title, subtitle }: UseViewerSessionOptions): void {
  useEffect(() => {
    if (!active || !isViewerSessionAvailable()) return;
    let cancelled = false;
    (async () => {
      await startViewerSession({ kind, title, subtitle });
      if (cancelled) {
        // Race: component unmounted before start resolved.
        await stopViewerSession();
      }
    })();
    return () => {
      cancelled = true;
      void stopViewerSession();
    };
    // title/subtitle changes shouldn't restart the FGS — they're cosmetic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, kind]);
}
