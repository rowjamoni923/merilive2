/**
 * Phase 0 (Camera Rebuild Plan, 2026-06-14) — JS shim for the native
 * `CameraAuthorityManager` (Kotlin). On web / older APKs without the
 * native method this is a safe no-op: `request()` simply runs the block.
 *
 * Wiring lands in Phase 6 — until then, no call site uses this module.
 * It exists here so Phase 0 stays compile-only on the JS side too.
 */

import { Capacitor } from '@capacitor/core';

export type CameraOwner =
  | 'live-stream'
  | 'private-call'
  | 'video-party'
  | 'game-party'
  | 'face-verify';

const KOTLIN_OWNER: Record<CameraOwner, string> = {
  'live-stream': 'LIVE_STREAM',
  'private-call': 'PRIVATE_CALL',
  'video-party': 'VIDEO_PARTY',
  'game-party': 'GAME_PARTY',
  'face-verify': 'FACE_VERIFY',
};

function nativeBridge(): any | null {
  if (Capacitor.getPlatform() !== 'android') return null;
  // LiveKitPlugin will expose `requestCameraAuthority` / `releaseCameraAuthority`
  // in Phase 6. Until then, fall back to JS-only serialization.
  const plugin = (Capacitor as any).Plugins?.LiveKitPlugin;
  if (plugin && typeof plugin.requestCameraAuthority === 'function') return plugin;
  return null;
}

// JS-side fallback serialization (used on web + pre-Phase-6 APKs)
const jsHolders = new Set<CameraOwner>();
const jsWaiters: Array<() => void> = [];

function jsFamily(owner: CameraOwner): 'streaming' | 'verification' {
  return owner === 'face-verify' ? 'verification' : 'streaming';
}

async function jsAcquire(owner: CameraOwner): Promise<void> {
  while (true) {
    if (jsHolders.size === 0) break;
    const heldFamily = jsFamily(Array.from(jsHolders)[0]!);
    if (heldFamily === jsFamily(owner)) break;
    await new Promise<void>((resolve) => jsWaiters.push(resolve));
  }
  jsHolders.add(owner);
}

function jsRelease(owner: CameraOwner): void {
  jsHolders.delete(owner);
  if (jsHolders.size === 0) {
    const w = jsWaiters.splice(0, jsWaiters.length);
    w.forEach((r) => r());
  }
}

/**
 * Acquire the camera for [owner], run [fn], release on completion or error.
 * On native (Phase 6+) this delegates to Kotlin `CameraAuthorityManager`.
 * On web / older APKs it uses an in-process serializer.
 */
export async function withCameraAuthority<T>(
  owner: CameraOwner,
  fn: () => Promise<T>,
): Promise<T> {
  const native = nativeBridge();
  if (native) {
    await native.requestCameraAuthority({ owner: KOTLIN_OWNER[owner] });
    try {
      return await fn();
    } finally {
      try {
        await native.releaseCameraAuthority({ owner: KOTLIN_OWNER[owner] });
      } catch {
        /* noop */
      }
    }
  }
  await jsAcquire(owner);
  try {
    return await fn();
  } finally {
    jsRelease(owner);
  }
}

export function isCameraHeldByOtherFamily(owner: CameraOwner): boolean {
  if (jsHolders.size === 0) return false;
  const heldFamily = jsFamily(Array.from(jsHolders)[0]!);
  return heldFamily !== jsFamily(owner);
}
