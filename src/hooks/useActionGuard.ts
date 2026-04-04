import { useRef, useCallback } from "react";

/**
 * Universal single-flight guard for admin actions.
 * Prevents duplicate clicks from firing the same action multiple times.
 * 
 * Usage:
 *   const { guard, isInFlight } = useActionGuard();
 *   
 *   const handleApprove = async (id: string) => {
 *     if (!guard.start(id)) return; // Already in flight
 *     try {
 *       await doSomething();
 *     } finally {
 *       guard.end(id);
 *     }
 *   };
 *   
 *   // In JSX:
 *   <Button disabled={isInFlight(id)} onClick={() => handleApprove(id)}>
 */
export const useActionGuard = () => {
  const inFlightRef = useRef<Set<string>>(new Set());

  const start = useCallback((key: string): boolean => {
    if (inFlightRef.current.has(key)) return false;
    inFlightRef.current.add(key);
    return true;
  }, []);

  const end = useCallback((key: string): void => {
    inFlightRef.current.delete(key);
  }, []);

  const isInFlight = useCallback((key: string): boolean => {
    return inFlightRef.current.has(key);
  }, []);

  const guard = { start, end };

  return { guard, isInFlight };
};

export default useActionGuard;
