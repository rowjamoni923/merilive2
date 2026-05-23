/**
 * Pkg244 — JS bus for native onTrimMemory pressure signals.
 *
 * Subscribes once to the MemoryTrim plugin event and fans out to consumers
 * (image cache, video prefetch, LiveKit downgrade). On web/desktop this is
 * a no-op; the bus exposes a stable API so callers don't need platform forks.
 *
 * Severities (most-to-least urgent):
 *   complete   — process at end of LRU; will be killed next
 *   moderate   — middle of LRU
 *   background — just backgrounded
 *   critical   — foreground, system about to LMK us → DROP EVERYTHING
 *   low        — foreground, aggressive trim
 *   uiHidden   — UI gone; safe to free render caches
 *   mild       — foreground, trim non-critical
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export type TrimSeverity =
  | 'mild'
  | 'low'
  | 'critical'
  | 'uiHidden'
  | 'background'
  | 'moderate'
  | 'complete';

export interface TrimEvent {
  level: number;
  severity: TrimSeverity;
}

interface MemoryTrimPluginShape {
  addListener(event: 'memoryTrim', cb: (e: TrimEvent) => void): Promise<{ remove: () => Promise<void> }>;
  getMemoryInfo(): Promise<{ availMem: number; totalMem: number; threshold: number; lowMemory: boolean }>;
}

const MemoryTrim = registerPlugin<MemoryTrimPluginShape>('MemoryTrim');

type Listener = (e: TrimEvent) => void;
const listeners = new Set<Listener>();
let initialized = false;
let lastEvent: TrimEvent | null = null;

async function init() {
  if (initialized) return;
  initialized = true;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await MemoryTrim.addListener('memoryTrim', (e) => {
      lastEvent = e;
      // Always log critical pressure for Crashlytics correlation
      if (e.severity === 'critical' || e.severity === 'complete') {
        console.warn('[memoryBus] pressure', e.severity, 'level=', e.level);
      }
      listeners.forEach((fn) => {
        try { fn(e); } catch (err) { console.warn('[memoryBus] listener threw', err); }
      });
    });
  } catch (err) {
    console.warn('[memoryBus] init failed', err);
  }
}

/** Severities that should force the app to free RAM immediately. */
const URGENT: TrimSeverity[] = ['critical', 'complete', 'low', 'moderate'];

export const memoryBus = {
  subscribe(fn: Listener): () => void {
    void init();
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
  /** Last event seen (null if never fired). */
  last(): TrimEvent | null { return lastEvent; },
  /** Convenience helper: subscribe only to urgent (RAM-freeing) pressure. */
  onUrgentTrim(fn: (e: TrimEvent) => void): () => void {
    return this.subscribe((e) => {
      if (URGENT.includes(e.severity)) fn(e);
    });
  },
  /** Synchronous one-shot memory probe (native only; web returns null). */
  async probe() {
    if (!Capacitor.isNativePlatform()) return null;
    try { return await MemoryTrim.getMemoryInfo(); }
    catch { return null; }
  },
};
