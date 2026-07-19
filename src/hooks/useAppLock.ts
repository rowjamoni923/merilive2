/**
 * Pkg210 — Biometric App Lock manager.
 *
 * - Reads/writes "appLockEnabled" preference in localStorage.
 * - When enabled + app resumes after >LOCK_GRACE_MS in background → lock.
 * - Cold start with enabled → lock.
 * - Provides isLocked, lock(), unlock() via biometric prompt.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { BiometricAuth } from '@/plugins/BiometricAuth';

const STORAGE_KEY = 'appLockEnabled';
const LOCK_GRACE_MS = 30_000; // re-lock if app was hidden for >30s

export function isAppLockEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function setAppLockEnabled(enabled: boolean) {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function useAppLock() {
  const [enabled, setEnabled] = useState<boolean>(() => isAppLockEnabled());
  const [isLocked, setIsLocked] = useState<boolean>(() => isAppLockEnabled());
  const lastHiddenAt = useRef<number>(0);

  const unlock = useCallback(async (): Promise<boolean> => {
    try {
      const r = await BiometricAuth.authenticate({
        title: 'Unlock MeriLive',
        reason: 'Confirm your identity to continue',
        allowDeviceCredential: true,
      });
      if (r.success) {
        setIsLocked(false);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const lock = useCallback(() => setIsLocked(true), []);

  const toggle = useCallback(async (next: boolean) => {
    if (next) {
      // require successful biometric before enabling
      const r = await BiometricAuth.authenticate({
        title: 'Enable App Lock',
        reason: 'Verify to turn on biometric app lock',
        allowDeviceCredential: true,
      });
      if (!r.success) return false;
      setAppLockEnabled(true);
      setEnabled(true);
      return true;
    }
    // disabling also requires biometric to prevent attacker from turning it off
    const r = await BiometricAuth.authenticate({
      title: 'Disable App Lock',
      reason: 'Verify to turn off biometric app lock',
      allowDeviceCredential: true,
    });
    if (!r.success) return false;
    setAppLockEnabled(false);
    setEnabled(false);
    setIsLocked(false);
    return true;
  }, []);

  useEffect(() => {
    let removeStateListener: (() => void) | undefined;
    (async () => {
      try {
        const sub = await CapApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            lastHiddenAt.current = Date.now();
          } else if (isAppLockEnabled()) {
            const hiddenFor = Date.now() - lastHiddenAt.current;
            if (lastHiddenAt.current && hiddenFor > LOCK_GRACE_MS) setIsLocked(true);
          }
        });
        removeStateListener = () => sub.remove();
      } catch {}
    })();
    return () => { removeStateListener?.(); };
  }, []);

  return { enabled, isLocked, lock, unlock, toggle };
}
