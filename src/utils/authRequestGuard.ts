import { supabase } from '@/integrations/supabase/client';

type GetUserResult = Awaited<ReturnType<typeof supabase.auth.getUser>>;
type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;

const USER_CACHE_TTL_MS = 10 * 60_000;          // 10 min hot cache
const SESSION_CACHE_TTL_MS = 10 * 60_000;       // 10 min hot cache
const TRANSIENT_ERROR_COOLDOWN_MS = 10 * 60_000; // 10 min cooldown on transient errors
const AUTH_SERVICE_BACKOFF_MS = 15 * 60_000;    // 15 min auth circuit-breaker
const MAX_STALE_RESULT_AGE_MS = 60 * 60 * 1000; // 60 min stale fallback — keep app alive during outages

let isInstalled = false;
let userInFlight: Promise<GetUserResult> | null = null;
let sessionInFlight: Promise<GetSessionResult> | null = null;
let lastUserResult: GetUserResult | null = null;
let lastSessionResult: GetSessionResult | null = null;
let lastUserAt = 0;
let lastSessionAt = 0;
let userCooldownUntil = 0;
let sessionCooldownUntil = 0;
let authServiceBackoffUntil = 0;

const TRANSIENT_ERROR_MARKERS = [
  'pgrst002',
  'context canceled',
  'unexpected_failure',
  'failed to connect',
  'schema cache',
  'network',
  'fetch',
  'timeout',
  'temporarily unavailable',
];

const isAbortError = (error: unknown) => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: string }).name === 'AbortError'
  );
};

const isTransientAuthFailure = (errorLike: unknown) => {
  if (!errorLike) return false;

  const errorObj = errorLike as {
    message?: string;
    code?: string;
    status?: number;
    name?: string;
  };

  if (typeof errorObj.status === 'number' && errorObj.status >= 500) return true;

  const fingerprint = `${errorObj.code ?? ''} ${errorObj.message ?? ''} ${errorObj.name ?? ''}`.toLowerCase();
  return TRANSIENT_ERROR_MARKERS.some((marker) => fingerprint.includes(marker));
};

const canServeStale = (lastAt: number) => {
  return lastAt > 0 && Date.now() - lastAt < MAX_STALE_RESULT_AGE_MS;
};

const toUserResultFromSession = (sessionResult: GetSessionResult): GetUserResult => {
  return ({
    data: { user: sessionResult.data.session?.user ?? null },
    error: null,
  } as GetUserResult);
};

export const installAuthRequestGuard = () => {
  if (isInstalled) return;
  isInstalled = true;

  const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
  const originalGetSession = supabase.auth.getSession.bind(supabase.auth);

  supabase.auth.onAuthStateChange((_event, session) => {
    const now = Date.now();
    lastSessionResult = ({ data: { session }, error: null } as GetSessionResult);
    lastSessionAt = now;
    lastUserResult = ({ data: { user: session?.user ?? null }, error: null } as GetUserResult);
    lastUserAt = now;
    userInFlight = null;
    sessionInFlight = null;
    userCooldownUntil = 0;
    sessionCooldownUntil = 0;
    authServiceBackoffUntil = 0;
  });

  // Prewarm session cache at startup so downstream getUser() can resolve from session
  // without hitting /user endpoint during initial route loads.
  sessionInFlight = originalGetSession()
    .then((sessionResult) => {
      lastSessionResult = sessionResult;
      lastSessionAt = Date.now();
      lastUserResult = toUserResultFromSession(sessionResult);
      lastUserAt = Date.now();
      return sessionResult;
    })
    .catch(() => ({ data: { session: null }, error: null } as GetSessionResult))
    .finally(() => {
      sessionInFlight = null;
    });

  (supabase.auth as any).getUser = (...args: any[]): Promise<GetUserResult> => {
    const canUseSharedCache = args.length === 0 || args[0] == null;
    const now = Date.now();

    if (canUseSharedCache) {
      if (now < authServiceBackoffUntil && lastSessionResult && canServeStale(lastSessionAt)) {
        const derivedFromSession = toUserResultFromSession(lastSessionResult);
        lastUserResult = derivedFromSession;
        lastUserAt = now;
        return Promise.resolve(derivedFromSession);
      }

      if (lastSessionResult && now - lastSessionAt < SESSION_CACHE_TTL_MS) {
        const derivedFromSession = toUserResultFromSession(lastSessionResult);
        lastUserResult = derivedFromSession;
        lastUserAt = now;
        return Promise.resolve(derivedFromSession);
      }

      // If session fetch is already in-flight, derive user from that instead of calling /user.
      if (sessionInFlight) {
        return sessionInFlight.then((sessionResult) => {
          lastSessionResult = sessionResult;
          lastSessionAt = Date.now();
          const derivedFromSession = toUserResultFromSession(sessionResult);
          lastUserResult = derivedFromSession;
          lastUserAt = Date.now();
          return derivedFromSession;
        });
      }

      if (now < userCooldownUntil && lastUserResult && canServeStale(lastUserAt)) {
        return Promise.resolve(lastUserResult);
      }
      if (userInFlight) return userInFlight;
      if (lastUserResult && now - lastUserAt < USER_CACHE_TTL_MS) {
        return Promise.resolve(lastUserResult);
      }

      // Prefer stale snapshot over new network pressure when service is unstable.
      if (lastUserResult && canServeStale(lastUserAt)) {
        return Promise.resolve(lastUserResult);
      }
    }

    const request: Promise<GetUserResult> = canUseSharedCache
      ? (supabase.auth as any)
          .getSession()
          .then((sessionResult: GetSessionResult) => {
            if (
              sessionResult?.error &&
              isTransientAuthFailure(sessionResult.error) &&
              lastUserResult &&
              canServeStale(lastUserAt)
            ) {
              userCooldownUntil = Date.now() + TRANSIENT_ERROR_COOLDOWN_MS;
              authServiceBackoffUntil = Date.now() + AUTH_SERVICE_BACKOFF_MS;
              console.warn('[AuthGuard] getSession transient error during getUser, serving cached snapshot');
              return lastUserResult;
            }

            lastSessionResult = sessionResult;
            lastSessionAt = Date.now();

            const derivedFromSession = toUserResultFromSession(sessionResult);
            lastUserResult = derivedFromSession;
            lastUserAt = Date.now();
            userCooldownUntil = 0;
            authServiceBackoffUntil = 0;
            return derivedFromSession;
          })
          .catch((error) => {
            if (isAbortError(error) || isTransientAuthFailure(error)) {
              if (lastUserResult && canServeStale(lastUserAt)) {
                userCooldownUntil = Date.now() + TRANSIENT_ERROR_COOLDOWN_MS;
                authServiceBackoffUntil = Date.now() + AUTH_SERVICE_BACKOFF_MS;
                console.warn('[AuthGuard] getUser session-derive failed, serving cached snapshot');
                return lastUserResult;
              }

              authServiceBackoffUntil = Date.now() + AUTH_SERVICE_BACKOFF_MS;
              return ({ data: { user: null }, error: null } as GetUserResult);
            }
            throw error;
          })
          .finally(() => {
            userInFlight = null;
          })
      : originalGetUser(...args);

    if (canUseSharedCache) {
      userInFlight = request;
    }

    return request;
  };

  (supabase.auth as any).getSession = (...args: any[]): Promise<GetSessionResult> => {
    const canUseSharedCache = args.length === 0;
    const now = Date.now();

    if (canUseSharedCache) {
      if (now < authServiceBackoffUntil && lastSessionResult && canServeStale(lastSessionAt)) {
        return Promise.resolve(lastSessionResult);
      }
      if (now < sessionCooldownUntil && lastSessionResult && canServeStale(lastSessionAt)) {
        return Promise.resolve(lastSessionResult);
      }
      if (sessionInFlight) return sessionInFlight;
      if (lastSessionResult && now - lastSessionAt < SESSION_CACHE_TTL_MS) {
        return Promise.resolve(lastSessionResult);
      }

      // Prefer stale session snapshot (up to MAX_STALE_RESULT_AGE_MS) over extra backend calls.
      if (lastSessionResult && canServeStale(lastSessionAt)) {
        return Promise.resolve(lastSessionResult);
      }
    }

    const request = originalGetSession(...args)
      .then((result) => {
        if (canUseSharedCache) {
          if (result?.error && isTransientAuthFailure(result.error) && lastSessionResult && canServeStale(lastSessionAt)) {
            sessionCooldownUntil = Date.now() + TRANSIENT_ERROR_COOLDOWN_MS;
            authServiceBackoffUntil = Date.now() + AUTH_SERVICE_BACKOFF_MS;
            console.warn('[AuthGuard] getSession transient backend error, serving cached snapshot');
            return lastSessionResult;
          }

          lastSessionResult = result;
          lastSessionAt = Date.now();
          sessionCooldownUntil = 0;
          authServiceBackoffUntil = 0;
        }
        return result;
      })
      .catch((error) => {
        if (canUseSharedCache && (isAbortError(error) || isTransientAuthFailure(error))) {
          if (lastSessionResult && canServeStale(lastSessionAt)) {
            sessionCooldownUntil = Date.now() + TRANSIENT_ERROR_COOLDOWN_MS;
            authServiceBackoffUntil = Date.now() + AUTH_SERVICE_BACKOFF_MS;
            console.warn('[AuthGuard] getSession request failed, serving cached snapshot');
            return lastSessionResult;
          }

          authServiceBackoffUntil = Date.now() + AUTH_SERVICE_BACKOFF_MS;
          if (isAbortError(error)) {
            return ({ data: { session: null }, error: null } as GetSessionResult);
          }
        }
        throw error;
      })
      .finally(() => {
        if (canUseSharedCache) {
          sessionInFlight = null;
        }
      });

    if (canUseSharedCache) {
      sessionInFlight = request;
    }

    return request;
  };

  console.log('[AuthGuard] ✅ Auth request guard installed (dedupe + stale fallback + cooldown)');
};
