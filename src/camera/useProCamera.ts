import { useEffect, useState } from 'react';
import type { CameraConflictError, ProCameraOwner } from './ProCameraEngine';
import { ProCameraEngine } from './ProCameraEngine';

export interface UseProCameraResult {
  ready: boolean;
  error: CameraConflictError | null;
  release: () => void;
}

export function useProCamera(owner: ProCameraOwner, enabled: boolean = true): UseProCameraResult {
  const [error, setError] = useState<CameraConflictError | null>(null);

  useEffect(() => {
    if (!enabled) {
      setError(null);
      return;
    }

    try {
      ProCameraEngine.acquire(owner);
      setError(null);
      return () => ProCameraEngine.release(owner);
    } catch (err) {
      setError(err instanceof Error && err.name === 'CameraConflictError' ? err as CameraConflictError : null);
    }
  }, [owner, enabled]);

  return {
    ready: enabled ? !error : true,
    error,
    release: () => ProCameraEngine.release(owner),
  };
}

export default useProCamera;
