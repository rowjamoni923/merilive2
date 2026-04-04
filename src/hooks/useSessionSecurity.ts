/**
 * Session Hijacking Protection Hook
 * Monitors session integrity by comparing device fingerprint, IP, and user agent
 * Alerts on suspicious changes and forces logout on critical risk
 */

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSecurityAlert } from '@/hooks/useSecurityAlert';
import { Capacitor } from '@capacitor/core';

interface SessionValidation {
  valid: boolean;
  risk_level: string;
  is_suspicious: boolean;
  alerts: Array<{ type: string; message: string }>;
  action: 'allow' | 'warn' | 'require_verification' | 'force_logout';
}

/**
 * Generate a simple device fingerprint from browser properties
 */
function generateDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 'unknown',
    (navigator as any).deviceMemory || 'unknown',
    navigator.platform,
  ];
  
  // Simple hash
  const str = components.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

const SESSION_CHECK_KEY = 'session_security_last_check';
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes
let validationInFlight: Promise<void> | null = null;
let lastValidationAt = 0;

export function useSessionSecurity() {
  const hasCheckedRef = useRef(false);
  const { alerts } = useSecurityAlert();
  const isNativeApp = Capacitor.isNativePlatform();

  const validateSession = useCallback(async () => {
    if (validationInFlight) return validationInFlight;

    const now = Date.now();
    if (now - lastValidationAt < CHECK_INTERVAL_MS) return;

    validationInFlight = (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;

        // Tab-level throttle
        const lastCheck = sessionStorage.getItem(SESSION_CHECK_KEY);
        if (lastCheck && Date.now() - parseInt(lastCheck) < CHECK_INTERVAL_MS) return;

        const fingerprint = generateDeviceFingerprint();
        const userAgent = navigator.userAgent;

        // Keep this lightweight; backend can still evaluate with available metadata
        const ipAddress = 'unknown';

        const { data, error } = await supabase.rpc('validate_session_integrity', {
          p_user_id: session.user.id,
          p_device_fingerprint: fingerprint,
          p_ip_address: ipAddress,
          p_user_agent: userAgent,
        });

        if (error) {
          console.error('[SessionSecurity] Validation error:', error);
          return;
        }

        const result = data as unknown as SessionValidation;
        const checkedAt = Date.now();
        sessionStorage.setItem(SESSION_CHECK_KEY, checkedAt.toString());
        lastValidationAt = checkedAt;

        if (result.action === 'force_logout') {
          toast.warning('⚠️ Session change detected. Please verify for security.', { duration: 8000 });
          alerts.sessionHijack(
            `Critical session anomaly: IP and device changed for user ${session.user.id}`,
            { ipAddress: ipAddress, deviceInfo: { fingerprint, userAgent, native: isNativeApp } }
          );
          // IMPORTANT: As per product requirement, never auto sign-out users.
          // Logout must happen only from user action (Settings > Logout).
        } else if (result.action === 'require_verification') {
          toast.warning('⚠️ Login detected from a different device.', { duration: 8000 });
          alerts.sessionHijack(
            `Device change detected for user ${session.user.id}`,
            { ipAddress: ipAddress, deviceInfo: { fingerprint, userAgent } }
          );
        } else if (result.action === 'warn') {
          toast.info('ℹ️ Your IP address has changed.', { duration: 5000 });
        }

        if (result.is_suspicious) {
          console.warn('[SessionSecurity] Suspicious activity:', result.alerts);
        }
      } catch (err) {
        console.error('[SessionSecurity] Error:', err);
      } finally {
        validationInFlight = null;
      }
    })();

    return validationInFlight;
  }, []);

  useEffect(() => {
    if (hasCheckedRef.current) return;
    hasCheckedRef.current = true;
    validateSession();

    // Periodic checks
    const interval = setInterval(validateSession, CHECK_INTERVAL_MS);

    // Check on visibility change (user returns to tab)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const lastCheck = Number(sessionStorage.getItem(SESSION_CHECK_KEY) || '0');
        if (Date.now() - lastCheck >= CHECK_INTERVAL_MS) {
          void validateSession();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [validateSession]);
}
