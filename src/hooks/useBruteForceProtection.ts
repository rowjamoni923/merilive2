/**
 * Brute Force Protection Hook
 * 
 * Enforces progressive lockout on failed login attempts:
 * - 5 fails → 5 min cooldown
 * - 10 fails → 15 min cooldown
 * - 15 fails → 30 min cooldown
 * - 20+ fails → 1 hour cooldown
 * 
 * Usage:
 * const { checkBeforeLogin, recordAttempt, lockoutInfo } = useBruteForceProtection();
 * const canLogin = await checkBeforeLogin(email);
 * if (!canLogin) return; // Locked out
 * // ... attempt login ...
 * await recordAttempt(email, success);
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
    try {
      const { data, error } = await supabase.rpc('check_brute_force', {
        p_identifier: email.toLowerCase().trim(),
      });

      if (error) {
        console.error('[BruteForce] Check error:', error);
        return true; // Allow on error to not block legitimate users
      }

      const result = data as any;

      if (result.locked) {
        const remaining = result.remaining_seconds || 0;
        const mins = Math.ceil(remaining / 60);

        setLockoutInfo({
          locked: true,
          lockedUntil: new Date(result.locked_until),
          remainingSeconds: remaining,
          failedAttempts: result.failed_attempts,
          attemptsRemaining: 0,
        });

        toast.error(`🔒 Account locked! Please try again after ${mins} minutes.`, {
          duration: 8000,
        });

        return false;
      }

      setLockoutInfo({
        locked: false,
        lockedUntil: null,
        remainingSeconds: 0,
        failedAttempts: result.failed_attempts || 0,
        attemptsRemaining: result.attempts_remaining || 5,
      });

      // Warn if close to lockout
      if (result.attempts_remaining <= 2 && result.attempts_remaining > 0) {
        toast.warning(`⚠️ ${result.attempts_remaining} attempts remaining.`, {
          duration: 5000,
        });
      }

      return true;
    } catch (err) {
      console.error('[BruteForce] Error:', err);
      return true;
    }
  }, []);

  const recordAttempt = useCallback(async (
    email: string,
    success: boolean,
    ipAddress?: string
  ) => {
    try {
      await supabase.rpc('record_login_attempt', {
        p_identifier: email.toLowerCase().trim(),
        p_success: success,
        p_ip_address: ipAddress || null,
        p_user_agent: navigator.userAgent,
      });

      if (!success) {
        // Re-check lockout status after failed attempt
        await checkBeforeLogin(email);
      } else {
        // Clear lockout info on success
        setLockoutInfo({
          locked: false,
          lockedUntil: null,
          remainingSeconds: 0,
          failedAttempts: 0,
          attemptsRemaining: 5,
        });
      }
    } catch (err) {
      console.error('[BruteForce] Record error:', err);
    }
  }, [checkBeforeLogin]);

  return {
    checkBeforeLogin,
    recordAttempt,
    lockoutInfo,
  };
}
