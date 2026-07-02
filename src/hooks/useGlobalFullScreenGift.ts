import { useEffect, useState } from "react";
import { getAppSetting } from "@/utils/appSettingsCache";

/**
 * Singleton FIFO queue for full-screen gift animations.
 *
 * Any gift-capable surface (Live, Party, Chat, Call, Profile, Reels) enqueues
 * high-value gifts via `enqueueFullScreenGift(...)`; the single
 * `<GlobalGiftAnimationLayer />` mounted in App root drains the queue one at
 * a time. This guarantees:
 *   - identical full-screen animation everywhere
 *   - no duplicate playback (single consumer)
 *   - respects native Android pipeline (dispatcher owns playback there)
 */

export interface FullScreenGiftJob {
  id: string;
  gift: {
    id: string;
    name: string;
    icon_url?: string;
    animation_url?: string;
    sound_url?: string;
    coin_value: number;
  };
  senderName: string;
  senderAvatar?: string;
  senderLevel?: number;
  receiverName: string;
  receiverAvatar?: string;
  receiverLevel?: number;
  quantity: number;
}

/** Coin threshold above which a gift also plays full-screen. Admin-tunable later. */
export const FULL_SCREEN_GIFT_COIN_THRESHOLD = 500;

const queue: FullScreenGiftJob[] = [];
const listeners = new Set<() => void>();
let current: FullScreenGiftJob | null = null;

function notify() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

function pump() {
  if (current || queue.length === 0) return;
  current = queue.shift() ?? null;
  notify();
}

export function enqueueFullScreenGift(job: Omit<FullScreenGiftJob, 'id'>): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  queue.push({ ...job, id });
  pump();
  return id;
}

export function completeCurrentFullScreenGift(id: string) {
  if (current?.id === id) {
    current = null;
    // Small gap between plays so eyes/ears reset
    setTimeout(() => {
      pump();
      notify();
    }, 120);
  }
}

/** Subscribe hook — returns the current active job (or null). */
export function useCurrentFullScreenGift(): FullScreenGiftJob | null {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  return current;
}
