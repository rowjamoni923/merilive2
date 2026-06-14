/**
 * Phase 0 (Camera Rebuild Plan, 2026-06-14) — JS shim for the native
 * `CameraAuthorityManager` (Kotlin). This file must NOT become a second
 * camera arbiter; all JS ownership routes through ProCameraEngine.
 */
import { ProCameraEngine, type ProCameraOwner } from '@/camera/ProCameraEngine';

export type CameraOwner =
  | 'live-stream'
  | 'private-call'
  | 'video-party'
  | 'game-party'
  | 'face-verify';

/**
 * Acquire the camera for [owner], run [fn], release on completion or error.
 * On native (Phase 6+) this delegates to Kotlin `CameraAuthorityManager`.
 * On web / older APKs it uses an in-process serializer.
 */
export async function withCameraAuthority<T>(
  owner: CameraOwner,
  fn: () => Promise<T>,
): Promise<T> {
  ProCameraEngine.acquire(owner as ProCameraOwner);
  try {
    return await fn();
  } finally {
    ProCameraEngine.release(owner as ProCameraOwner);
  }
}

export function isCameraHeldByOtherFamily(owner: CameraOwner): boolean {
  const family = ProCameraEngine.currentFamily();
  if (!family) return false;
  return owner === 'face-verify' ? family !== 'verification' : family !== 'streaming';
}
