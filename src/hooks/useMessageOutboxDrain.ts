/**
 * Pkg212 — Auto-drain hook for offline DM outbox.
 *
 * Re-attempts queued sends on:
 *   • window "online" event
 *   • document visibilitychange → visible
 *   • Capacitor appStateChange → active
 *   • periodic 30s tick as belt-and-suspenders
 *
 * The `send(item)` callback is provided by the caller (Chat.tsx) and
 * receives one OutboxItem; resolves on success (the hook then removes
 * it from the queue) or throws on failure (attempt counter bumped).
 *
 * Failsafe: max 12 attempts per item, otherwise dropped + logged.
 */
import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { messageOutbox, type OutboxItem } from '@/lib/messageOutbox';
import { networkBus } from '@/lib/networkBus';

const MAX_ATTEMPTS = 12;
const TICK_MS = 30_000;

export function useMessageOutboxDrain(
  enabled: boolean,
  senderId: string | null,
  send: (item: OutboxItem) => Promise<void>,
) {
  const inflightRef = useRef(false);
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    if (!enabled || !senderId) return;

    const drain = async () => {
      if (inflightRef.current || !networkBus.isOnline()) return;
      inflightRef.current = true;
      try {
        const items = messageOutbox.list().filter(i => i.senderId === senderId);
        for (const item of items) {
          if (!networkBus.isOnline()) break;
          if (item.attempts >= MAX_ATTEMPTS) {
            messageOutbox.remove(item.id);
            console.warn('[Outbox] dropped after max attempts', item.id);
            continue;
          }
          try {
            await sendRef.current(item);
            messageOutbox.remove(item.id);
          } catch (e: any) {
            messageOutbox.bumpAttempt(item.id, e?.message || 'send_failed');
            // back off — break the loop; next tick/event will retry
            break;
          }
        }
      } finally {
        inflightRef.current = false;
      }
    };

    // initial sweep
    drain();

    // Pkg243 — push-based connectivity (Android NetworkCallback under the hood).
    // Fires the millisecond Wi-Fi/cell flips, no JS polling needed.
    const unsubBus = networkBus.subscribe((snap) => {
      if (snap.connected) drain();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') drain(); };
    document.addEventListener('visibilitychange', onVisible);
    const interval = window.setInterval(drain, TICK_MS);

    let removeAppListener: (() => void) | undefined;
    (async () => {
      try {
        const sub = await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) drain();
        });
        removeAppListener = () => sub.remove();
      } catch {}
    })();

    return () => {
      unsubBus();
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(interval);
      removeAppListener?.();
    };
  }, [enabled, senderId]);
}
