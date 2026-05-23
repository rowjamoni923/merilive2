/**
 * Pkg255 — Shake-to-feedback hook.
 *
 * Starts the native shake detector while mounted, opens a feedback dialog
 * via a shared event bus when the device is shaken. App-wide singleton —
 * mount once near the app root.
 */
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  isShakeFeedbackEnabled,
  isShakeSupported,
  onShake,
  startShakeDetector,
  stopShakeDetector,
} from '@/plugins/ShakeDetector';
import { hapticPreset } from '@/plugins/Vibration';

export type FeedbackTrigger = 'shake' | 'menu';

const listeners = new Set<(t: FeedbackTrigger) => void>();

export function openFeedbackDialog(trigger: FeedbackTrigger = 'menu') {
  listeners.forEach((l) => {
    try { l(trigger); } catch {}
  });
}

export function subscribeFeedbackOpen(cb: (t: FeedbackTrigger) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useShakeToFeedback() {
  useEffect(() => {
    if (!isShakeSupported() || Capacitor.getPlatform() !== 'android') return;
    if (!isShakeFeedbackEnabled()) return;

    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;

    (async () => {
      await startShakeDetector();
      const h = await onShake(() => {
        if (!isShakeFeedbackEnabled()) return;
        hapticPreset('warning');
        openFeedbackDialog('shake');
      });
      if (cancelled && h) { try { h.remove(); } catch {} return; }
      handle = h as any;
    })();

    return () => {
      cancelled = true;
      if (handle) { try { handle.remove(); } catch {} }
      stopShakeDetector();
    };
  }, []);
}
