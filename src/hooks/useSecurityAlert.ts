/**
 * useSecurityAlert Hook
 * 
 * Provides functions to raise security alerts from anywhere in the app.
 * Alerts are stored in the database and sent to admins in real-time.
 * 
 * Usage:
 * const { raiseAlert, alertTypes } = useSecurityAlert();
 * await raiseAlert('session_hijack', 'critical', 'Session hijacked from new device');
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AlertType =
  | 'session_hijack'
  | 'brute_force'
  | 'suspicious_transfer'
  | 'vpn_detected'
  | 'device_banned'
  | 'multiple_accounts'
  | 'rapid_login'
  | 'unauthorized_access'
  | 'balance_manipulation'
  | 'rate_limit_exceeded';

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

interface AlertOptions {
  ipAddress?: string;
  deviceInfo?: Record<string, any>;
  metadata?: Record<string, any>;
}

// Client-side dedup cache to avoid spamming same alert
const recentAlerts = new Map<string, number>();
const DEDUP_WINDOW_MS = 60_000; // 1 minute

function isDuplicate(alertType: string, severity: string): boolean {
  const key = `${alertType}:${severity}`;
  const last = recentAlerts.get(key);
  if (last && Date.now() - last < DEDUP_WINDOW_MS) return true;
  recentAlerts.set(key, Date.now());
  return false;
}

export function useSecurityAlert() {
  const raiseAlert = useCallback(async (
    alertType: AlertType,
    severity: AlertSeverity,
    description: string,
    options: AlertOptions = {}
  ): Promise<string | null> => {
    // Dedup check
    if (isDuplicate(alertType, severity)) {
      console.log('[SecurityAlert] Skipping duplicate alert:', alertType);
      return null;
    }

    try {
      const { data, error } = await supabase.rpc('raise_security_alert', {
        p_alert_type: alertType,
        p_severity: severity,
        p_description: description,
        p_ip_address: options.ipAddress || null,
        p_device_info: options.deviceInfo || null,
        p_metadata: options.metadata || {},
      });

      if (error) {
        console.error('[SecurityAlert] Failed to raise alert:', error);
        return null;
      }

      console.warn(`[SecurityAlert] 🚨 ${severity.toUpperCase()}: ${alertType} - ${description}`);
      return data as string;
    } catch (err) {
      console.error('[SecurityAlert] Error:', err);
      return null;
    }
  }, []);

  // Pre-built alert helpers
  const alerts = {
    sessionHijack: (desc: string, opts?: AlertOptions) =>
      raiseAlert('session_hijack', 'critical', desc, opts),

    bruteForce: (desc: string, opts?: AlertOptions) =>
      raiseAlert('brute_force', 'high', desc, opts),

    suspiciousTransfer: (desc: string, opts?: AlertOptions) =>
      raiseAlert('suspicious_transfer', 'high', desc, opts),

    vpnDetected: (desc: string, opts?: AlertOptions) =>
      raiseAlert('vpn_detected', 'low', desc, opts),

    deviceBanned: (desc: string, opts?: AlertOptions) =>
      raiseAlert('device_banned', 'medium', desc, opts),

    multipleAccounts: (desc: string, opts?: AlertOptions) =>
      raiseAlert('multiple_accounts', 'medium', desc, opts),

    rateLimitExceeded: (desc: string, opts?: AlertOptions) =>
      raiseAlert('rate_limit_exceeded', 'medium', desc, opts),

    unauthorizedAccess: (desc: string, opts?: AlertOptions) =>
      raiseAlert('unauthorized_access', 'critical', desc, opts),
  };

  return { raiseAlert, alerts };
}
