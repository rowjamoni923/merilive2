/**
 * 🛡️ Network Resilience Engine
 * 
 * Ultra-powerful network layer that ensures:
 * - Instant recovery when network comes back online
 * - Auto-reconnect realtime channels on connectivity change
 * - Prefetch critical data on app resume
 * - Connection quality detection & adaptive behavior
 * - Zero visible "reconnecting" states
 */

import { supabase } from '@/integrations/supabase/client';
import { forceReconnectChannel, getConnectionStatus } from '@/hooks/useUniversalRealtime';
import { getAdaptiveNetworkProfile, getConnectionTier } from '@/utils/connectionProfile';

// ============= Connection Quality =============
type ConnectionQuality = 'excellent' | 'good' | 'slow' | 'offline';

let currentQuality: ConnectionQuality = 'good';
let lastOnlineAt = Date.now();
let lastOfflineAt = 0;
let lastHiddenAt = 0;
let lastRecoveryAt = 0;
let isEngineRunning = false;
let networkCheckInterval: ReturnType<typeof setInterval> | null = null;
let pendingReconnect: ReturnType<typeof setTimeout> | null = null;
let recoveryInFlight: Promise<void> | null = null;

const qualityListeners = new Set<(quality: ConnectionQuality) => void>();

// ============= Speed Test (lightweight) =============
const measureLatency = async (): Promise<number> => {
  const start = performance.now();
  const { healthProbeTimeoutMs } = getAdaptiveNetworkProfile();

  try {
    // Ping Supabase Auth health endpoint — lightweight and returns 200 with the anon key.
    // Avoid /rest/v1/ HEAD because PostgREST root returns 401 and creates noisy false failures.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), healthProbeTimeoutMs);

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!response.ok) throw new Error(`Supabase health check failed: ${response.status}`);
      return performance.now() - start;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    // On weak networks a probe timeout should be treated as slow, not hard-offline.
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      return healthProbeTimeoutMs + 1200;
    }
    return 9999;
  }
};

const classifyQuality = (latencyMs: number): ConnectionQuality => {
  const tier = getConnectionTier();

  if (tier === 'offline') return 'offline';

  if (latencyMs >= 9000) {
    return typeof navigator !== 'undefined' && navigator.onLine ? 'slow' : 'offline';
  }

  if (tier === 'slow-2g' || tier === '2g') {
    return latencyMs > 1800 ? 'slow' : 'good';
  }

  if (tier === '3g') {
    return latencyMs > 1400 ? 'slow' : 'good';
  }

  if (latencyMs > 2200) return 'slow';
  if (latencyMs > 900) return 'good';
  return 'excellent';
};

const updateQuality = (quality: ConnectionQuality) => {
  if (quality === currentQuality) return;
  const prev = currentQuality;
  currentQuality = quality;
  console.log(`[NetworkEngine] Quality: ${prev} → ${quality}`);
  qualityListeners.forEach((fn) => fn(quality));
};

// ============= Recovery Actions =============
const performInstantRecovery = async (reason: 'online' | 'resume' | 'silent-disconnect') => {
  if (recoveryInFlight) return recoveryInFlight;

  const now = Date.now();
  // Prevent duplicate recoveries fired by overlapping listeners
  if (now - lastRecoveryAt < 12_000) {
    console.log('[NetworkEngine] ⏭️ Recovery skipped (cooldown)');
    return;
  }

  recoveryInFlight = (async () => {
    lastRecoveryAt = Date.now();
    console.log(`[NetworkEngine] ⚡ Instant recovery triggered (${reason})`);

    // 1. Reconnect realtime only when needed
    const { isConnected } = getConnectionStatus();
    if (!isConnected || reason === 'online' || reason === 'silent-disconnect') {
      forceReconnectChannel();
    }

    // 2. Measure actual latency to classify connection
    const latency = await measureLatency();
    updateQuality(classifyQuality(latency));

    // 3. Refresh auth session silently to prevent stale tokens
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        console.log('[NetworkEngine] ✅ Session valid after recovery');
      }
    } catch {
      // Silently ignore — authRequestGuard handles fallback
    }
  })().finally(() => {
    recoveryInFlight = null;
  });

  return recoveryInFlight;
};

// ============= Network Event Handlers =============
const handleOnline = () => {
  lastOnlineAt = Date.now();
  const wasOfflineMs = lastOfflineAt > 0 ? lastOnlineAt - lastOfflineAt : 0;
  console.log(`[NetworkEngine] 🟢 Online (was offline for ${wasOfflineMs}ms)`);
  
  // Cancel any pending reconnect
  if (pendingReconnect) {
    clearTimeout(pendingReconnect);
    pendingReconnect = null;
  }

  // Instant recovery — no waiting
  void performInstantRecovery('online');
};

const handleOffline = () => {
  lastOfflineAt = Date.now();
  updateQuality('offline');
  console.log('[NetworkEngine] 🔴 Offline detected');
};

const handleVisibilityChange = () => {
  if (document.visibilityState === 'hidden') {
    lastHiddenAt = Date.now();
    return;
  }

  if (document.visibilityState === 'visible') {
    const hiddenForMs = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
    // Resume recovery only if app was really backgrounded
    if (hiddenForMs >= 8000) {
      console.log('[NetworkEngine] 👁 App resumed — quick recovery');
      void performInstantRecovery('resume');
    }
  }
};

// ============= Periodic Health Check =============
const startHealthMonitor = () => {
  if (networkCheckInterval) return;

  const { healthCheckIntervalMs } = getAdaptiveNetworkProfile();

  // Adaptive cadence by network quality (e.g., slower cadence on 2G/3G)
  networkCheckInterval = setInterval(async () => {
    if (!navigator.onLine) {
      updateQuality('offline');
      return;
    }

    // Avoid background churn when app is hidden
    if (document.visibilityState === 'hidden') return;

    const latency = await measureLatency();
    const quality = classifyQuality(latency);
    const wasOffline = currentQuality === 'offline';
    updateQuality(quality);

    // If we just recovered from offline state, run one guarded recovery pass
    if (wasOffline && quality !== 'offline') {
      console.log('[NetworkEngine] ⚠️ Silent disconnection recovered — forcing recovery');
      void performInstantRecovery('silent-disconnect');
    }
  }, healthCheckIntervalMs);
};

// ============= Native App Integration =============
const setupNativeListeners = async () => {
  try {
    const { Network } = await import('@capacitor/network');
    
    await Network.addListener('networkStatusChange', (status) => {
      if (status.connected) {
        handleOnline();
      } else {
        handleOffline();
      }
    });

    // Also listen for app resume
    try {
      const { App } = await import('@capacitor/app');
      await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          console.log('[NetworkEngine] 📱 App resumed from background');
          void performInstantRecovery('resume');
        }
      });
    } catch {
      // App plugin not available — web fallback
    }
  } catch {
    // Network plugin not available — web fallback only
  }
};

// ============= Public API =============

export const getConnectionQuality = (): ConnectionQuality => currentQuality;

export const onQualityChange = (listener: (quality: ConnectionQuality) => void): (() => void) => {
  qualityListeners.add(listener);
  return () => qualityListeners.delete(listener);
};

/**
 * Start the Network Resilience Engine.
 * Call once at app startup (e.g., in App.tsx or main.tsx).
 */
export const startNetworkResilienceEngine = () => {
  if (isEngineRunning) return;
  isEngineRunning = true;

  console.log('[NetworkEngine] 🚀 Starting Network Resilience Engine');

  // Web event listeners
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Native listeners (async, non-blocking)
  void setupNativeListeners();

  // Background health monitor
  startHealthMonitor();

  // Initial quality check deferred to idle to protect first paint
  const runInitialCheck = () => {
    void measureLatency().then((latency) => {
      updateQuality(classifyQuality(latency));
    });
  };

  if (typeof (window as any).requestIdleCallback === 'function') {
    (window as any).requestIdleCallback(runInitialCheck, { timeout: 2500 });
  } else {
    setTimeout(runInitialCheck, 1200);
  }
};

/**
 * Stop the engine (cleanup).
 */
export const stopNetworkResilienceEngine = () => {
  if (!isEngineRunning) return;
  isEngineRunning = false;

  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (networkCheckInterval) {
    clearInterval(networkCheckInterval);
    networkCheckInterval = null;
  }

  if (pendingReconnect) {
    clearTimeout(pendingReconnect);
    pendingReconnect = null;
  }

  qualityListeners.clear();
  console.log('[NetworkEngine] 🛑 Stopped');
};
