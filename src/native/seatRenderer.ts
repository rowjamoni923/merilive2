/**
 * Phase 0 (Camera Rebuild Plan, 2026-06-14) — JS shim for the native
 * `SeatRendererBinder` (Kotlin). On web / older APKs this is a safe no-op.
 *
 * Wiring lands in Phase 1 (Video Party seat-tile camera). Until then no
 * caller uses this module; it exists so Phase 0 stays compile-only.
 *
 * The native side resolves the participant + camera track via
 * `Room.remoteParticipants[identity]` and calls
 * `videoTrack.addRenderer(textureView, ViewVisibility(view))` (LiveKit
 * Android SDK). Seat reshuffle = unbindSeat(seatIndex) + bindSeat(...).
 */

import { Capacitor } from '@capacitor/core';

function plugin(): any | null {
  if (Capacitor.getPlatform() !== 'android') return null;
  const p = (Capacitor as any).Plugins?.LiveKitPlugin;
  if (p && typeof p.bindSeatRenderer === 'function') return p;
  return null;
}

export interface BindSeatArgs {
  seatIndex: number;
  identity: string;
  /**
   * DOM selector or element ID that the native side will mirror with a
   * TextureView positioned behind the WebView (same coordinates).
   * Phase 1 will finalize the coordinate-bridge protocol.
   */
  anchorSelector?: string;
}

export async function bindSeatRenderer(args: BindSeatArgs): Promise<void> {
  const p = plugin();
  if (!p) return; // web / older APK no-op
  try {
    await p.bindSeatRenderer(args);
  } catch (e) {
    console.warn('[seatRenderer] bind failed', e);
  }
}

export async function unbindSeatRenderer(seatIndex: number): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.unbindSeatRenderer({ seatIndex });
  } catch (e) {
    console.warn('[seatRenderer] unbind failed', e);
  }
}

export async function clearAllSeatRenderers(): Promise<void> {
  const p = plugin();
  if (!p) return;
  try {
    await p.clearAllSeatRenderers();
  } catch {
    /* noop */
  }
}
