/**
 * useProCamera — React hook wrapper around ProCameraEngine.
 *
 * Mounts → acquires the camera slot for the given feature.
 * Unmounts → releases it.
 *
 * If acquisition fails because the other family holds the camera
 * (e.g. user tries to go live during face verification), `error` is set
 * and the consumer should show a friendly message + bail out of starting
 * its LiveKit session.
 *
 * Usage:
 *   const { ready, error } = useProCamera('live-stream');
 *   if (error) return <CameraBusy reason={error.message} />;
 *   if (!ready) return null;
 *   // ...then start LiveKit publisher
 */
import { useEffect, useRef, useState } from 'react';
import {
  ProCameraEngine,
  type ProCameraOwner,
  CameraConflictError,
} from './ProCameraEngine';

export interface UseProCameraResult {
  ready: boolean;
  error: CameraConflictError | null;
  release: () => void;
}

export function useProCamera(owner: ProCameraOwner, enabled: boolean = true): UseProCameraResult {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraConflictError | null>(null);
  const heldRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      if (heldRef.current) {
        ProCameraEngine.release(owner);
        heldRef.current = false;
      }
      setReady(false);
      setError(null);
      return;
    }

    try {
      ProCameraEngine.acquire(owner);
      heldRef.current = true;
      setReady(true);
      setError(null);
    } catch (e) {
      if (e instanceof CameraConflictError) {
        setError(e);
        setReady(false);
      } else {
        throw e;
      }
    }

    return () => {
      if (heldRef.current) {
        ProCameraEngine.release(owner);
        heldRef.current = false;
      }
    };
  }, [owner, enabled]);

  return {
    ready,
    error,
    release: () => {
      if (heldRef.current) {
        ProCameraEngine.release(owner);
        heldRef.current = false;
        setReady(false);
      }
    },
  };
}

export default useProCamera;
