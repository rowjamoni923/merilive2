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
  },
  '2g': {
  },
  '3g': {
  },
  '4g': {
  },
  '5g': {
  },
  unknown: {
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
    };
    webkitConnection?: {
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
