/**
 * Pkg266 — Proximity sensor screen-off wake lock bridge.
 *
 * WhatsApp-style: during a voice call, holding the phone to the ear blanks
 * the screen (saves battery + prevents ear/cheek touches). The OS releases
 * the wake lock automatically when the sensor reports "far".
 *
 * Use only during AUDIO-only calls — never during video calls, live
 * streaming, or party rooms where the user must see the screen.
 *
 * Web has no equivalent — this is a no-op outside Android.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ProximityLockShape {
  isSupported(): Promise<{ supported: boolean }>;
  acquire(): Promise<{ held: boolean }>;
  release(): Promise<{ held: boolean }>;
}

const ProximityLock = registerPlugin<ProximityLockShape>("ProximityLock");

export function isProximityLockNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export async function isProximityLockSupported(): Promise<boolean> {
  if (!isProximityLockNative()) return false;
  try {
    const r = await ProximityLock.isSupported();
    return !!r.supported;
  } catch {
    return false;
  }
}

// Ref-count so concurrent audio calls don't release each other's lock.
let acquiredCount = 0;

export async function acquireProximityLock(): Promise<() => Promise<void>> {
  if (!isProximityLockNative()) {
    return async () => { /* no-op on web */ };
  }
  acquiredCount += 1;
  if (acquiredCount === 1) {
    try { await ProximityLock.acquire(); } catch { /* ignore */ }
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    acquiredCount = Math.max(0, acquiredCount - 1);
    if (acquiredCount === 0) {
      try { await ProximityLock.release(); } catch { /* ignore */ }
    }
  };
}
