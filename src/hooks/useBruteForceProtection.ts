/**
 * Login attempt compatibility hook.
 *
 * Product policy: the app must never time-lock users/admins out of login.
 * Single-device control is handled by `user_active_sessions`: a newer device
 * becomes active and the older device is displaced, not the other way around.
 */

import { useState, useCallback } from 'react';

interface LockoutInfo {
  locked: boolean;
  lockedUntil: Date | null;
  remainingSeconds: number;
  failedAttempts: number;
  attemptsRemaining: number;
}

export function useBruteForceProtection() {
  const [lockoutInfo, setLockoutInfo] = useState<LockoutInfo>({
    locked: false,
    lockedUntil: null,
    remainingSeconds: 0,
    failedAttempts: 0,
    attemptsRemaining: 5,
  });

  const checkBeforeLogin = useCallback(async (email: string): Promise<boolean> => {
    setLockoutInfo({
    });
    return true;
  }, []);

  const recordAttempt = useCallback(async (
    email: string,
    success: boolean,
    ipAddress?: string
  ) => {
    setLockoutInfo({
    });
  }, [checkBeforeLogin]);

  return {
    checkBeforeLogin,
    recordAttempt,
    lockoutInfo,
  };
}
