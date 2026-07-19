/**
 * USER BALANCE HOOK - Global Diamond Balance Cache
 * 
 * Provides instant access to user's diamond balance across all components.
 * Pre-fetched on app load, avoids repeated database queries.
 * 
 * Usage: 
 * - Call useUserBalancePrefetch() in App.tsx to initialize
 * - Use useUserBalance() in any component for instant balance access
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isStandalonePublicLocation } from '@/utils/publicRoutes';

// Module-level balance cache (singleton)
interface BalanceCache {
  balance: number;
  userId: string | null;
  timestamp: number;
  loading: boolean;
  initialized: boolean;
}

const balanceCache: BalanceCache = {
  balance: 0,
  userId: null,
  timestamp: 0,
  loading: false,
  initialized: false,
};

const CACHE_DURATION = 15 * 1000; // 15 seconds - faster refresh for real-time feel
const listeners: Set<(balance: number) => void> = new Set();
let balanceFetchPromise: Promise<number> | null = null;
let balanceRequestSeq = 0;

/**
 * Fetch user balance and update cache
 */
async function fetchBalance(userIdOverride?: string | null, forceRefresh = false): Promise<number> {
  // Prevent duplicate fetches
  if (balanceCache.loading && !forceRefresh) {
    return balanceFetchPromise ?? Promise.resolve(balanceCache.balance);
  }

  balanceCache.loading = true;
  const requestSeq = ++balanceRequestSeq;

  balanceFetchPromise = (async () => {
    try {
      // Prefer caller-provided userId from App session to avoid even a local auth lookup during route paint.
      let userId = userIdOverride || null;
      if (!userId) {
        const { data: { session } } = await supabase.auth.getSession();
        userId = session?.user?.id || null;
      }

      if (!userId) {
        if (requestSeq === balanceRequestSeq) {
          balanceCache.balance = 0;
          balanceCache.userId = null;
          balanceCache.timestamp = Date.now();
          balanceCache.initialized = false;
        }
        balanceCache.loading = false;
        return 0;
      }

      // Return cached if valid
      if (
        balanceCache.userId === userId &&
        balanceCache.initialized &&
        !forceRefresh &&
        Date.now() - balanceCache.timestamp < CACHE_DURATION
      ) {
        balanceCache.loading = false;
        return balanceCache.balance;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('diamonds') // ZERO-DIAMOND: Diamond is the single spend wallet. No diamonds fallback.
        .eq('id', userId)
        .single();

      if (error) {
        console.error('[UserBalance] Error:', error);
        balanceCache.loading = false;
        return balanceCache.balance;
      }

      const newBalance = Number((profile as any)?.diamonds ?? 0);
      if (requestSeq === balanceRequestSeq) {
        balanceCache.balance = newBalance;
        balanceCache.userId = userId;
        balanceCache.timestamp = Date.now();
        balanceCache.initialized = true;

        // Notify all listeners
        listeners.forEach(cb => cb(newBalance));
      }

      console.log(`[UserBalance] ✅ Cached balance: ${newBalance}`);
    } catch (e) {
      console.error('[UserBalance] Failed:', e);
    } finally {
      if (requestSeq === balanceRequestSeq) {
        balanceCache.loading = false;
        balanceFetchPromise = null;
      }
    }

    return balanceCache.balance;
  })();

  return balanceFetchPromise;
}

/**
 * Get cached balance synchronously
 */
export function getCachedBalance(): number {
  return balanceCache.balance;
}

export function isBalanceCacheInitialized(): boolean {
  return balanceCache.initialized;
}

/**
 * Get balance with fetch if needed
 */
export async function getBalanceWithFetch(forceRefresh = false): Promise<number> {
  if (
    !forceRefresh &&
    balanceCache.initialized &&
    balanceCache.userId &&
    Date.now() - balanceCache.timestamp < CACHE_DURATION
  ) {
    return balanceCache.balance;
  }
  return fetchBalance(null, forceRefresh);
}

/**
 * Update cached balance (call after transactions)
 */
export function updateCachedBalance(newBalance: number): void {
  balanceCache.balance = newBalance;
  balanceCache.timestamp = Date.now();
  balanceCache.initialized = true;
  listeners.forEach(cb => cb(newBalance));
}

/**
 * Subscribe to balance updates
 */
export function subscribeToBalance(callback: (balance: number) => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Clear balance cache (call on logout)
 */
export function clearBalanceCache(): void {
  balanceCache.balance = 0;
  balanceCache.userId = null;
  balanceCache.timestamp = 0;
  balanceCache.initialized = false;
}

/**
 * Hook to prefetch balance on mount
 * Call this in App.tsx to pre-warm cache
 */
export function useUserBalancePrefetch(userId?: string | null): void {
  const prefetchedUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      prefetchedUserId.current = null;
      return;
    }
    if (typeof window !== 'undefined' && isStandalonePublicLocation()) return;
    if (prefetchedUserId.current === userId) return;
    prefetchedUserId.current = userId;

    // Prefetch on idle so auth/home first paint does not compete with this DB read.
    const w = window as any;
    const usesIdle = typeof w.requestIdleCallback === 'function';
    const timer = usesIdle
      ? w.requestIdleCallback(() => {
        fetchBalance(userId);
      }, { timeout: 3500 })
      : setTimeout(() => {
      fetchBalance(userId);
      }, 3500);

    // Balance sync is event-based here. A prior global `profiles` subscription was
    // unfiltered inside the shared channel, so every profile change in the app was
    // delivered to every client and made the whole app feel slow.
    const handleAppSync = async (event: Event) => {
      const detail = (event as CustomEvent<{ topic?: string; payload?: Record<string, any> }>).detail;
      if (detail?.topic !== 'profiles') return;

      const payload = detail.payload || {};
      if (payload.profile_id && payload.profile_id !== userId) return;

      const diamonds = payload.diamonds;
      if (diamonds !== undefined) {
        balanceCache.userId = userId;
        updateCachedBalance(Number(diamonds || 0));
      }

      if (payload.beans !== undefined && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('own-beans-updated', {
          detail: { userId, beans: Number(payload.beans || 0) },
        }));
      }
    };
    window.addEventListener('app-sync', handleAppSync as EventListener);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setTimeout(() => void fetchBalance(session.user.id), 0);
      }
    });

    return () => {
      if (usesIdle && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(timer);
      else clearTimeout(timer);
      window.removeEventListener('app-sync', handleAppSync as EventListener);
      authListener.subscription.unsubscribe();
    };
  }, [userId]);
}

/**
 * Hook to use cached balance with real-time updates
 */
export function useUserBalance() {
  const [balance, setBalance] = useState(getCachedBalance());
  const [loading, setLoading] = useState(!balanceCache.initialized);
  const [initialized, setInitialized] = useState(balanceCache.initialized);

  useEffect(() => {
    // Subscribe to balance updates
    const unsubscribe = subscribeToBalance((newBalance) => {
      setBalance(newBalance);
      setLoading(false);
      setInitialized(true);
    });

    // Fetch if not cached
    if (!balanceCache.initialized) {
      getBalanceWithFetch().then((b) => {
        setBalance(b);
        setLoading(false);
        setInitialized(true);
      });
    } else {
      setLoading(false);
      setInitialized(true);
    }

    return unsubscribe;
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    const newBalance = await fetchBalance();
    setBalance(newBalance);
    setLoading(false);
    setInitialized(true);
    return newBalance;
  }, []);

  return {
    balance,
    loading,
    initialized,
    refetch,
  };
}

export default useUserBalance;