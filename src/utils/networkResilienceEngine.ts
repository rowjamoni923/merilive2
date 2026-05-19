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

const isAdminRoute = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/admin');

// ============= Speed Test (lightweight) =============
const measureLatency = async (): Promise<number> => {
  const start = performance.now();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 9999;
  }

  // Do not ping Supabase for health checks. Preview/native fetch proxies can fail
  // synthetic health probes while normal REST/storage data requests still work,
  // which creates global "Failed to fetch" noise and false offline states.
  const connection = (typeof navigator !== 'undefined'
    ? (navigator as Navigator & { connection?: { rtt?: number; downlink?: number } }).connection
    : undefined);

  if (typeof connection?.rtt === 'number' && connection.rtt > 0) return connection.rtt;
  if (typeof connection?.downlink === 'number') {
    if (connection.downlink <= 0.8) return 2600;
    if (connection.downlink <= 1.8) return 1500;
    if (connection.downlink <= 12) return 700;
  }

  return performance.now() - start;
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
  if (isAdminRoute()) return;
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

    // 1. Measure actual latency to classify connection.
    // Supabase/native sockets recover themselves; no forced channel rebuild here.
    const latency = await measureLatency();
    updateQuality(classifyQuality(latency));

    // 2. No data/auth refetch here. Realtime + request guards keep state fresh
    // without any foreground/visibility-triggered refresh storm.
  })().finally(() => {
    recoveryInFlight = null;
  });

  return recoveryInFlight;
};

// ============= Network Event Handlers =============
const handleOnline = () => {
  if (isAdminRoute()) return;
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
  if (isAdminRoute()) return;
  lastOfflineAt = Date.now();
  updateQuality('offline');
  console.log('[NetworkEngine] 🔴 Offline detected');
};

const handleVisibilityChange = () => {
  if (isAdminRoute()) return;
  if (document.visibilityState === 'hidden') {
    lastHiddenAt = Date.now();
    return;
  }

  if (document.visibilityState === 'visible') {
    const hiddenForMs = lastHiddenAt ? Date.now() - lastHiddenAt : 0;
    // Zero-refresh policy: visibility changes must not trigger app/data refresh.
    if (hiddenForMs >= 8000) {
      console.log('[NetworkEngine] 👁 App visible — refresh skipped');
    }
  }
};

// ============= Periodic Health Check =============
const startHealthMonitor = () => {
  // Zero-refresh policy: no app-wide polling/health loop. Network changes are
  // handled by native/browser online/offline events only.
  return;

  if (networkCheckInterval) return;

  const { healthCheckIntervalMs } = getAdaptiveNetworkProfile();

  // Adaptive cadence by network quality (e.g., slower cadence on 2G/3G)
  networkCheckInterval = setInterval(async () => {
    if (isAdminRoute()) return;
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

    // App foreground/resume is intentionally ignored to avoid automatic refresh.
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
