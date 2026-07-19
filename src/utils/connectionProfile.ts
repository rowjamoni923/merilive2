export type ConnectionTier = 'offline' | 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'unknown';

export type AdaptiveNetworkProfile = {
  maxConcurrentRequests: number;
  healthyRequestGapMs: number;
  degradedRequestGapMs: number;
  requestTimeoutMs: number;
  responseCacheTtlMs: number;
  staleIfErrorMs: number;
  routeFailureThreshold: number;
  routeCircuitOpenMs: number;
  maxBackoffMs: number;
  healthProbeTimeoutMs: number;
  healthCheckIntervalMs: number;
  queryRetryCount: number;
  queryRetryBaseDelayMs: number;
  queryRetryMaxDelayMs: number;
};

const PROFILE_CACHE_MS = 4000;

let cachedProfile: AdaptiveNetworkProfile | null = null;
let cachedAt = 0;

const PROFILES: Record<ConnectionTier, AdaptiveNetworkProfile> = {
  offline: {
    maxConcurrentRequests: 2,
    healthyRequestGapMs: 180,
    degradedRequestGapMs: 260,
    requestTimeoutMs: 30000,
    responseCacheTtlMs: 60000,
    staleIfErrorMs: 10 * 60_000,
    routeFailureThreshold: 3,
    routeCircuitOpenMs: 16_000,
    maxBackoffMs: 10_000,
    healthProbeTimeoutMs: 10_000,
    healthCheckIntervalMs: 90_000,
    queryRetryCount: 0,
    queryRetryBaseDelayMs: 3000,
    queryRetryMaxDelayMs: 12000,
  },
  'slow-2g': {
    maxConcurrentRequests: 2,
    healthyRequestGapMs: 140,
    degradedRequestGapMs: 220,
    requestTimeoutMs: 32000,
    responseCacheTtlMs: 60000,
    staleIfErrorMs: 10 * 60_000,
    routeFailureThreshold: 3,
    routeCircuitOpenMs: 16_000,
    maxBackoffMs: 9000,
    healthProbeTimeoutMs: 10_000,
    healthCheckIntervalMs: 90_000,
    queryRetryCount: 3,
    queryRetryBaseDelayMs: 3500,
    queryRetryMaxDelayMs: 15000,
  },
  '2g': {
    maxConcurrentRequests: 3,
    healthyRequestGapMs: 120,
    degradedRequestGapMs: 180,
    requestTimeoutMs: 28000,
    responseCacheTtlMs: 45000,
    staleIfErrorMs: 8 * 60_000,
    routeFailureThreshold: 4,
    routeCircuitOpenMs: 14_000,
    maxBackoffMs: 8000,
    healthProbeTimeoutMs: 9000,
    healthCheckIntervalMs: 90_000,
    queryRetryCount: 3,
    queryRetryBaseDelayMs: 3000,
    queryRetryMaxDelayMs: 12000,
  },
  '3g': {
    maxConcurrentRequests: 6,
    healthyRequestGapMs: 0,
    degradedRequestGapMs: 80,
    requestTimeoutMs: 24000,
    responseCacheTtlMs: 30000,
    staleIfErrorMs: 6 * 60_000,
    routeFailureThreshold: 4,
    routeCircuitOpenMs: 13_000,
    maxBackoffMs: 7000,
    healthProbeTimeoutMs: 7000,
    healthCheckIntervalMs: 75_000,
    queryRetryCount: 2,
    queryRetryBaseDelayMs: 2400,
    queryRetryMaxDelayMs: 9000,
  },
  '4g': {
    maxConcurrentRequests: 12,
    healthyRequestGapMs: 0,
    degradedRequestGapMs: 30,
    requestTimeoutMs: 18000,
    responseCacheTtlMs: 15000,
    staleIfErrorMs: 300000,
    routeFailureThreshold: 5,
    routeCircuitOpenMs: 12000,
    maxBackoffMs: 5000,
    healthProbeTimeoutMs: 4500,
    healthCheckIntervalMs: 60_000,
    queryRetryCount: 1,
    queryRetryBaseDelayMs: 1800,
    queryRetryMaxDelayMs: 5000,
  },
  '5g': {
    maxConcurrentRequests: 15,
    healthyRequestGapMs: 0,
    degradedRequestGapMs: 20,
    requestTimeoutMs: 16000,
    responseCacheTtlMs: 12000,
    staleIfErrorMs: 240000,
    routeFailureThreshold: 5,
    routeCircuitOpenMs: 11000,
    maxBackoffMs: 4500,
    healthProbeTimeoutMs: 3800,
    healthCheckIntervalMs: 55_000,
    queryRetryCount: 1,
    queryRetryBaseDelayMs: 1500,
    queryRetryMaxDelayMs: 4500,
  },
  unknown: {
    maxConcurrentRequests: 10,
    healthyRequestGapMs: 0,
    degradedRequestGapMs: 40,
    requestTimeoutMs: 20000,
    responseCacheTtlMs: 20000,
    staleIfErrorMs: 360000,
    routeFailureThreshold: 4,
    routeCircuitOpenMs: 12_000,
    maxBackoffMs: 6500,
    healthProbeTimeoutMs: 6000,
    healthCheckIntervalMs: 65_000,
    queryRetryCount: 2,
    queryRetryBaseDelayMs: 2000,
    queryRetryMaxDelayMs: 7000,
  },
};

const getConnection = () => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      saveData?: boolean;
    };
    mozConnection?: {
      effectiveType?: string;
      downlink?: number;
      saveData?: boolean;
    };
    webkitConnection?: {
      effectiveType?: string;
      downlink?: number;
      saveData?: boolean;
    };
  };

  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection ?? null;
};

const normalizeTier = (value?: string): ConnectionTier => {
  const tier = value?.toLowerCase();
  if (tier === 'slow-2g' || tier === '2g' || tier === '3g' || tier === '4g') {
    return tier;
  }
  return 'unknown';
};

export const getConnectionTier = (): ConnectionTier => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

  const connection = getConnection();
  const normalized = normalizeTier(connection?.effectiveType);

  let tier: ConnectionTier = normalized;

  if (normalized === 'unknown') {
    const downlink = connection?.downlink;
    if (typeof downlink === 'number') {
      if (downlink <= 0.35) tier = 'slow-2g';
      else if (downlink <= 0.8) tier = '2g';
      else if (downlink <= 1.8) tier = '3g';
      else if (downlink <= 12) tier = '4g';
      else tier = '5g';
    }
  }

  if (connection?.saveData) {
    if (tier === '5g' || tier === '4g') return '3g';
    return tier;
  }

  return tier;
};

export const getAdaptiveNetworkProfile = (): AdaptiveNetworkProfile => {
  const now = Date.now();
  if (cachedProfile && now - cachedAt < PROFILE_CACHE_MS) {
    return cachedProfile;
  }

  const tier = getConnectionTier();
  cachedProfile = PROFILES[tier] ?? PROFILES.unknown;
  cachedAt = now;

  return cachedProfile;
};
