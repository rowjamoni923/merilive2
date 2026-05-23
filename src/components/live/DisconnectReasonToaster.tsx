/**
 * Pkg202 — Global toast surfacer for LiveKit disconnect-reason events (M5).
 *
 * Mount once near the app root. Subscribes to the
 * `livekit-disconnect-reason` window event emitted by
 * `src/lib/livekitDisconnectReason.ts` and shows a sonner toast unless
 * the descriptor is marked `silent` (CLIENT_INITIATED, MIGRATION, etc).
 *
 * Pure listener — renders nothing, $1400-rule safe.
 */

import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  DISCONNECT_REASON_EVENT,
  type DisconnectReasonEventDetail,
} from '@/lib/livekitDisconnectReason';

export function DisconnectReasonToaster() {
  useEffect(() => {
    const onDisconnect = (e: Event) => {
      const d = (e as CustomEvent<DisconnectReasonEventDetail>).detail;
      if (!d || d.silent) return;

      const opts = { description: d.message, duration: d.isFinal ? 6000 : 3500 };
      if (d.severity === 'error') toast.error(d.title, opts);
      else if (d.severity === 'warning') toast.warning(d.title, opts);
      else toast(d.title, opts);
    };
    window.addEventListener(DISCONNECT_REASON_EVENT, onDisconnect);
    return () => window.removeEventListener(DISCONNECT_REASON_EVENT, onDisconnect);
  }, []);

  return null;
}

export default DisconnectReasonToaster;
