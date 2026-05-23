/**
 * Pkg265 — Screen brightness + keep-awake controller.
 *
 * Native side flips `FLAG_KEEP_SCREEN_ON` + per-window `screenBrightness`
 * override so we never sleep mid-stream and can push max brightness during
 * PK battles / OBS-grade host previews.
 *
 * Usage:
 *   const release = await acquireScreenLock({ brightness: 1.0 });
 *   // ...streaming...
 *   release();  // restore both flags
 *
 * Web fallback uses the Screen Wake Lock API where available (Chrome,
 * recent Safari). Brightness boost is Android-only — Web has no API.
 *
 * Ref-counted: multiple components can call acquireScreenLock() and the
 * native flag is only cleared when the last release() fires.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";

interface ScreenControlShape {
  setKeepScreenOn(opts: { on: boolean }): Promise<{ on: boolean }>;
  setBrightness(opts: { level: number }): Promise<{ level: number }>;
  getState(): Promise<{ keepScreenOn: boolean; brightness: number }>;
}

const ScreenControl = registerPlugin<ScreenControlShape>("ScreenControl");

export function isScreenControlNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

// ---- ref-counted state ----
let lockCount = 0;
let webWakeLock: WakeLockSentinel | null = null;
let lastBrightness = -1; // -1 = system default

type WakeLockSentinel = { released: boolean; release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
};

async function applyNativeWakeLock(on: boolean) {
  if (isScreenControlNative()) {
    try { await ScreenControl.setKeepScreenOn({ on }); } catch { /* ignore */ }
    return;
  }
  // Web fallback
  try {
    const nav = navigator as NavigatorWithWakeLock;
    if (on) {
      if (!nav.wakeLock) return;
      if (webWakeLock && !webWakeLock.released) return;
      webWakeLock = await nav.wakeLock.request("screen");
    } else if (webWakeLock && !webWakeLock.released) {
      await webWakeLock.release();
      webWakeLock = null;
    }
  } catch { /* fallthrough */ }
}

export async function setBrightness(level: number): Promise<void> {
  // level: 0.0–1.0, or -1 to release
  lastBrightness = level;
  if (!isScreenControlNative()) return; // Web has no equivalent
  try { await ScreenControl.setBrightness({ level }); } catch { /* ignore */ }
}

export interface ScreenLockOptions {
  brightness?: number; // 0.0–1.0; omit to leave brightness untouched
}

export async function acquireScreenLock(opts: ScreenLockOptions = {}): Promise<() => Promise<void>> {
  lockCount += 1;
  if (lockCount === 1) {
    await applyNativeWakeLock(true);
  }
  if (typeof opts.brightness === "number") {
    await setBrightness(opts.brightness);
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      await applyNativeWakeLock(false);
      if (lastBrightness !== -1) {
        await setBrightness(-1);
      }
    }
  };
}

export async function getScreenState(): Promise<{ keepScreenOn: boolean; brightness: number }> {
  if (isScreenControlNative()) {
    try { return await ScreenControl.getState(); } catch { /* ignore */ }
  }
  return { keepScreenOn: !!webWakeLock && !webWakeLock.released, brightness: lastBrightness };
}
