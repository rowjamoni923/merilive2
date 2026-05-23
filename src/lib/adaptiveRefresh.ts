/**
 * Pkg247 — Adaptive refresh rate JS wrapper.
 *
 * Use boostHighRefresh() on entering live video / fast-scroll surfaces
 * (LiveStream, PartyRoom, Feed). Call releaseHighRefresh() on unmount.
 *
 * Reference-counted so multiple callers compose safely.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

interface AdaptiveRefreshPlugin {
  getInfo(): Promise<{ currentHz?: number; maxHz?: number; supported?: number[]; error?: string }>;
  boostMax(): Promise<void>;
  release(): Promise<void>;
}

const Native = registerPlugin<AdaptiveRefreshPlugin>('AdaptiveRefresh');

let refs = 0;
let lastBoostAt = 0;

const isAndroid = () => Capacitor.getPlatform() === 'android';

export async function getRefreshInfo() {
  if (!isAndroid()) return { currentHz: 60, maxHz: 60, supported: [60] };
  try { return await Native.getInfo(); } catch { return { currentHz: 60, maxHz: 60 }; }
}

export async function boostHighRefresh() {
  if (!isAndroid()) return;
  refs += 1;
  if (refs > 1) return;
  // Avoid thrash: at least 500ms between boost/release cycles
  const since = Date.now() - lastBoostAt;
  if (since < 500) await new Promise((r) => setTimeout(r, 500 - since));
  lastBoostAt = Date.now();
  try { await Native.boostMax(); } catch { /* no-op */ }
}

export async function releaseHighRefresh() {
  if (!isAndroid()) return;
  refs = Math.max(0, refs - 1);
  if (refs > 0) return;
  try { await Native.release(); } catch { /* no-op */ }
}
