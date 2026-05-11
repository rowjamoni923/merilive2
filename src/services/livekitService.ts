/**
 * LiveKit Token Service
 * Fetches LiveKit tokens from the edge function for all media sections.
 * Includes short-lived in-memory caching + in-flight dedup for instant joins.
 */
import { supabase } from '@/integrations/supabase/client';
import { getAdminLinkToken } from '@/utils/adminAccessStorage';

interface LiveKitTokenResponse {
  token: string;
  url: string;
}

interface LiveKitTokenRequest {
  roomName: string;
  roomType: 'call' | 'host_stream' | 'viewer_stream' | 'party';
  participantName?: string;
  hidden?: boolean;
  /** Party rooms only: `false` = subscribe-only (audience). Omitted = legacy default (publish allowed). */
  partyCanPublish?: boolean;
}

const TOKEN_CACHE_TTL_MS = 25_000;
const ACCESS_TOKEN_CACHE_TTL_MS = 15_000;

const tokenCache = new Map<string, { value: LiveKitTokenResponse; expiresAt: number }>();
const inFlightTokenRequests = new Map<string, Promise<LiveKitTokenResponse>>();

let accessTokenCache: { value?: string; expiresAt: number } | null = null;
let accessTokenInFlight: Promise<string | undefined> | null = null;

const getAuthAccessToken = async (): Promise<string | undefined> => {
  const cached = accessTokenCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  if (accessTokenInFlight) return accessTokenInFlight;

  accessTokenInFlight = supabase.auth
    .getSession()
    .then(({ data }) => {
      const token = data.session?.access_token;
      accessTokenCache = {
        value: token,
        expiresAt: Date.now() + ACCESS_TOKEN_CACHE_TTL_MS,
      };
      return token;
    })
    .catch(() => undefined)
    .finally(() => {
      accessTokenInFlight = null;
    });

  return accessTokenInFlight;
};

const isAuthLikeError = (error: unknown) => {
  const message = String((error as any)?.message || '').toLowerCase();
  const status = (error as any)?.context?.status ?? (error as any)?.status;
  return status === 401 || status === 403 ||
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('jwt');
};

const invokeLiveKitToken = async (request: LiveKitTokenRequest, accessToken?: string) => {
  const adminLinkToken = !accessToken ? getAdminLinkToken() : null;
  const headers: Record<string, string> = {};

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (adminLinkToken) {
    headers['x-admin-access-token'] = adminLinkToken;
  }

  const body: Record<string, unknown> = {
    roomName: request.roomName,
    roomType: request.roomType,
  };
  if (request.participantName) body.participantName = request.participantName;
  if (request.hidden) body.hidden = true;
  if (request.roomType === 'party') {
    body.partyCanPublish = request.partyCanPublish !== false;
  }

  return supabase.functions.invoke('livekit-token', {
    body,
    ...(Object.keys(headers).length > 0 ? { headers } : {}),
  });
};

const getCacheKey = (request: LiveKitTokenRequest, accessToken?: string) => {
  const tokenScope = accessToken ? accessToken.slice(-16) : 'anon';
  const hiddenFlag = request.hidden ? ':hidden' : '';
  const partyPub =
    request.roomType === 'party' ? `:pp:${request.partyCanPublish !== false}` : '';
  return `${request.roomType}::${request.roomName}::${request.participantName ?? ''}::${tokenScope}${hiddenFlag}${partyPub}`;
};

const getFromCache = (cacheKey: string): LiveKitTokenResponse | null => {
  const cached = tokenCache.get(cacheKey);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    tokenCache.delete(cacheKey);
    return null;
  }

  return cached.value;
};

const setTokenCache = (cacheKey: string, value: LiveKitTokenResponse) => {
  tokenCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + TOKEN_CACHE_TTL_MS,
  });
};

const requestFreshToken = async (
  request: LiveKitTokenRequest,
  accessToken?: string
): Promise<LiveKitTokenResponse> => {
  let { data, error } = await invokeLiveKitToken(request, accessToken);

  // Handle auth race after app resume/background by refreshing session once
  if (error && isAuthLikeError(error)) {
    console.warn('[LiveKit] Token request unauthorized, refreshing session and retrying once...');
    await supabase.auth.refreshSession();
    const refreshedToken = await getAuthAccessToken();
    ({ data, error } = await invokeLiveKitToken(request, refreshedToken));
  }

  if (error) {
    console.error('[LiveKit] Token error:', error);
    throw new Error((error as any)?.message || 'Failed to get LiveKit token');
  }

  if (!data?.token || !data?.url) {
    throw new Error('Invalid token response');
  }

  return { token: data.token, url: data.url };
};

export async function getLiveKitToken(
  roomName: string,
  roomType: 'call' | 'host_stream' | 'viewer_stream' | 'party',
  participantName?: string,
  hidden?: boolean,
  partyCanPublish?: boolean
): Promise<LiveKitTokenResponse> {
  const request: LiveKitTokenRequest = {
    roomName,
    roomType,
    participantName,
    ...(hidden ? { hidden: true } : {}),
    ...(roomType === 'party' && partyCanPublish !== undefined ? { partyCanPublish } : {}),
  };

  const accessToken = await getAuthAccessToken();
  const cacheKey = getCacheKey(request, accessToken);

  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const inFlight = inFlightTokenRequests.get(cacheKey);
  if (inFlight) return inFlight;

  const tokenPromise = requestFreshToken(request, accessToken)
    .then((freshToken) => {
      setTokenCache(cacheKey, freshToken);
      return freshToken;
    })
    .finally(() => {
      inFlightTokenRequests.delete(cacheKey);
    });

  inFlightTokenRequests.set(cacheKey, tokenPromise);
  return tokenPromise;
}

// Optional prewarm for ultra-fast room entry (non-blocking callers can ignore await)
export function warmLiveKitToken(
  roomName: string,
  roomType: 'call' | 'host_stream' | 'viewer_stream' | 'party',
  participantName?: string,
  hidden?: boolean,
  partyCanPublish?: boolean
): Promise<LiveKitTokenResponse> {
  return getLiveKitToken(roomName, roomType, participantName, hidden, partyCanPublish);
}
