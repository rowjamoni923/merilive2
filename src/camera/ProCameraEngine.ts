/**
 * =============================================================================
 * ProCameraEngine — ONE camera, ONE pipeline, FOUR surfaces
 * =============================================================================
 *
 * Rule (Pkg416):
 *   Live Streaming · Private Call · Video Party · Game Party
 *     → all share ONE LiveKit camera publisher.
 *   Face Verification → uses the native CameraX plugin EXCLUSIVELY, and
 *     never overlaps with the LiveKit publisher.
 *
 * This module does NOT own pixels. It owns the *right* to open the camera.
 * It is a reference-counted arbiter on top of LiveKit (web/native). All four
 * streaming features call `acquire(owner)` before starting their LiveKit
 * session, and `release(owner)` when they tear down. The underlying camera
 * stays open as long as at least one streaming feature holds it.
 *
 * Why this exists:
 *   Before Pkg416, multiple hooks (useBeautyState, useCameraSDK, raw
 *   getUserMedia in pages, native CameraX in face-verify) could each open
 *   the front camera independently. On Android the second opener got
 *   CAMERA_IN_USE → blank white preview, app sometimes crashed.
 *
 * Contract:
 *   - Streaming owners (live/call/video-party/game-party) belong to the
 *     'streaming' family. Multiple streaming owners may coexist
 *     (reference count) — they share the same camera track.
 *   - 'face-verify' is the single 'verification' family owner. It is
 *     mutually exclusive with the streaming family.
 *   - Any new owner kind is rejected (fail loud, never silently steal).
 */

export type ProCameraOwner =
  | 'live-stream'
  | 'private-call'
  | 'video-party'
  | 'game-party'
  | 'face-verify';

type Family = 'streaming' | 'verification';

const FAMILY: Record<ProCameraOwner, Family> = {
  'live-stream': 'streaming',
  'private-call': 'streaming',
  'video-party': 'streaming',
  'game-party': 'streaming',
  'face-verify': 'verification',
};

export class CameraConflictError extends Error {
  constructor(
    public readonly requested: ProCameraOwner,
    public readonly currentFamily: Family,
    public readonly currentOwners: ProCameraOwner[],
  ) {
    super(
      `[ProCameraEngine] cannot acquire '${requested}' — camera is held by ` +
        `${currentFamily} family (${currentOwners.join(', ')}). ` +
        `Streaming and verification cameras are mutually exclusive.`,
    );
    this.name = 'CameraConflictError';
  }
}

interface State {
  family: Family | null;
  refs: Map<ProCameraOwner, number>;
  listeners: Set<() => void>;
}

const state: State = {
  family: null,
  refs: new Map(),
  listeners: new Set(),
};

function notify(): void {
  for (const listener of state.listeners) {
    try {
      listener();
    } catch (err) {
      console.error('[ProCameraEngine] listener threw', err);
    }
  }
}

/**
 * Take ownership for the given feature. Safe to call multiple times — the
 * camera is reference-counted, so `acquire('live-stream')` twice means two
 * `release('live-stream')` calls are required to actually free it.
 *
 * Throws `CameraConflictError` when the camera is held by the OTHER family.
 * Callers should surface this as a user-friendly toast (e.g. "Please finish
 * face verification first").
 */
export function acquire(owner: ProCameraOwner): void {
  const requestedFamily = FAMILY[owner];
  if (!requestedFamily) {
    throw new Error(`[ProCameraEngine] unknown owner '${owner}'`);
  }

  if (state.family && state.family !== requestedFamily) {
    throw new CameraConflictError(
      owner,
      state.family,
      Array.from(state.refs.keys()),
    );
  }

  state.family = requestedFamily;
  state.refs.set(owner, (state.refs.get(owner) ?? 0) + 1);
  notify();

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[ProCameraEngine] acquire(${owner}) family=${requestedFamily} refs=${state.refs.get(owner)} total=${totalRefs()}`,
    );
  }
}

/**
 * Release one reference. When all references are gone the family slot is
 * cleared so the other family can acquire next.
 */
export function release(owner: ProCameraOwner): void {
  const current = state.refs.get(owner) ?? 0;
  if (current <= 1) {
    state.refs.delete(owner);
  } else {
    state.refs.set(owner, current - 1);
  }
  if (state.refs.size === 0) {
    state.family = null;
  }
  notify();

  if (process.env.NODE_ENV !== 'production') {
    console.log(
      `[ProCameraEngine] release(${owner}) refs=${state.refs.get(owner) ?? 0} total=${totalRefs()} family=${state.family ?? 'free'}`,
    );
  }
}

/** Emergency reset — only call from app-wide error recovery. */
export function forceRelease(): void {
  state.refs.clear();
  state.family = null;
  notify();
}

export function currentOwners(): ProCameraOwner[] {
  return Array.from(state.refs.keys());
}

export function currentFamily(): Family | null {
  return state.family;
}

export function isHeldBy(owner: ProCameraOwner): boolean {
  return (state.refs.get(owner) ?? 0) > 0;
}

export function totalRefs(): number {
  let n = 0;
  for (const v of state.refs.values()) n += v;
  return n;
}

export function subscribe(listener: () => void): () => void {
  state.listeners.add(listener);
  return () => state.listeners.delete(listener);
}

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
