import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface VpnResult {
  vpn: boolean;
  proxy: boolean;
  tor: boolean;
  relay: boolean;
  country_code?: string;
  city?: string;
  isp?: string;
  ip?: string;
  local?: boolean;
}

interface UseVpnDetectionReturn {
  isVpn: boolean;
  isProxy: boolean;
  isTor: boolean;
  isRelay: boolean;
  isAnyDetected: boolean;
  isChecking: boolean;
  dismissed: boolean;
  dismiss: () => void;
  vpnResult: VpnResult | null;
}

const CACHE_KEY = "meri_vpn_check";
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour
const FAILURE_CACHE_KEY = "meri_vpn_check_failure";
const FAILURE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes after failure
const REQUEST_TIMEOUT_MS = 4500;

let vpnCheckInFlight: Promise<VpnResult | null> | null = null;

const readCache = (): VpnResult | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as { data: VpnResult; timestamp: number };
    if (Date.now() - parsed.timestamp < CACHE_DURATION) {
      return parsed.data;
    }
  } catch {
    // ignore cache parsing errors
  }
  return null;
};

const writeCache = (data: VpnResult) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now(),
    }));
  } catch {
    // ignore storage quota errors
  }
};

const isFailureCooldownActive = (): boolean => {
  try {
    const lastFailureAt = Number(localStorage.getItem(FAILURE_CACHE_KEY) || 0);
    return lastFailureAt > 0 && Date.now() - lastFailureAt < FAILURE_COOLDOWN_MS;
  } catch {
    return false;
  }
};

const markFailureCooldown = () => {
  try {
    localStorage.setItem(FAILURE_CACHE_KEY, String(Date.now()));
  } catch {
    // ignore storage errors
  }
};

const clearFailureCooldown = () => {
  try {
    localStorage.removeItem(FAILURE_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
};

const fetchVpnWithTimeout = async (): Promise<VpnResult | null> => {
  const request = supabase.functions.invoke("detect-vpn").then(({ data, error }) => {
    if (error) {
      console.error("[useVpnDetection] Error:", error);
      return null;
    }
    return (data as VpnResult) ?? null;
  });

  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), REQUEST_TIMEOUT_MS);
  });

  return Promise.race([request, timeout]);
};

export function useVpnDetection(): UseVpnDetectionReturn {
  const [vpnResult, setVpnResult] = useState<VpnResult | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Defer VPN check to avoid blocking initial render
    const deferTimer = setTimeout(async () => {
      try {
        const cached = readCache();
        if (cached) {
          setVpnResult(cached);
          return;
        }

        if (isFailureCooldownActive()) {
          return;
        }

        if (!vpnCheckInFlight) {
          vpnCheckInFlight = fetchVpnWithTimeout().finally(() => {
            vpnCheckInFlight = null;
          });
        }

        const data = await vpnCheckInFlight;
        if (data) {
          setVpnResult(data);
          writeCache(data);
          clearFailureCooldown();
          return;
        }

        // Prevent retry storms when provider/rate-limit errors happen
        markFailureCooldown();
      } catch (err) {
        markFailureCooldown();
        console.error("[useVpnDetection] Error:", err);
      } finally {
        setIsChecking(false);
      }
    }, 3000); // Defer 3s to prioritize UI rendering

    return () => clearTimeout(deferTimer);
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  const isAnyDetected = !!(vpnResult?.vpn || vpnResult?.proxy || vpnResult?.tor || vpnResult?.relay);

  return {
    isVpn: vpnResult?.vpn || false,
    isProxy: vpnResult?.proxy || false,
    isTor: vpnResult?.tor || false,
    isRelay: vpnResult?.relay || false,
    isAnyDetected,
    isChecking,
    dismissed,
    dismiss,
    vpnResult,
  };
}
