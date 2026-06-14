/**
 * useProCamera — STUB (Step 1 rebuild, 2026-06-14).
 *
 * Always returns `ready: true` with no error. The new simple LiveKit
 * plugin (Step 2) needs no per-feature acquisition because there is
 * only one camera path.
 */
import type { CameraConflictError, ProCameraOwner } from './ProCameraEngine';

export interface UseProCameraResult {
  ready: boolean;
  error: CameraConflictError | null;
  release: () => void;
}

export function useProCamera(_owner: ProCameraOwner, _enabled: boolean = true): UseProCameraResult {
  return {
    ready: true,
    error: null,
    release: () => undefined,
  };
}

export default useProCamera;
