/**
 * ProCameraEngine — STUB (Step 1 rebuild, 2026-06-14).
 *
 * The reference-counted ownership arbiter has been removed. With one
 * LiveKit camera path coming in Step 2 there are no overlapping owners
 * to coordinate. All methods are no-ops that keep the public TS surface
 * intact so existing call sites compile until they are cleaned up.
 */

export type ProCameraOwner =
  | 'live-stream'
  | 'private-call'
  | 'video-party'
  | 'game-party'
  | 'face-verify';

export class CameraConflictError extends Error {
  public readonly currentFamily: 'streaming' | 'verification' | null = null;
  public readonly currentOwners: ProCameraOwner[] = [];
  constructor(public readonly requested: ProCameraOwner) {
    super(`[ProCameraEngine] stub: no conflict tracking for '${requested}'`);
    this.name = 'CameraConflictError';
  }
}

export function acquire(_owner: ProCameraOwner): void { /* no-op */ }
export function release(_owner: ProCameraOwner): void { /* no-op */ }
export function forceRelease(): void { /* no-op */ }
export function currentOwners(): ProCameraOwner[] { return []; }
export function currentFamily(): null { return null; }
export function isHeldBy(_owner: ProCameraOwner): boolean { return false; }
export function totalRefs(): number { return 0; }
export function subscribe(_listener: () => void): () => void { return () => undefined; }

export const ProCameraEngine = {
  acquire,
  release,
  forceRelease,
  currentOwners,
  currentFamily,
  isHeldBy,
  totalRefs,
  subscribe,
};

export default ProCameraEngine;
