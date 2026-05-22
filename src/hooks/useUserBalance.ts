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

/**
 * Fetch user balance and update cache
 */
async function fetchBalance(): Promise<number> {
  // Prevent duplicate fetches
  if (balanceCache.loading) {
    return balanceFetchPromise ?? Promise.resolve(balanceCache.balance);
  }

  balanceCache.loading = true;

  balanceFetchPromise = (async () => {
    try {
      // Use getSession (local) instead of getUser (network) for speed
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        balanceCache.balance = 0;
        balanceCache.userId = null;
        balanceCache.timestamp = Date.now();
        balanceCache.initialized = true;
        balanceCache.loading = false;
        return 0;
      }

      // Return cached if valid
      if (
        balanceCache.userId === user.id &&
        balanceCache.initialized &&
        Date.now() - balanceCache.timestamp < CACHE_DURATION
      ) {
        balanceCache.loading = false;
        return balanceCache.balance;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('coins, diamonds')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('[UserBalance] Error:', error);
        balanceCache.loading = false;
        return balanceCache.balance;
      }

      const newBalance = Math.max(Number(profile?.coins || 0), Number((profile as any)?.diamonds || 0));
      balanceCache.balance = newBalance;
      balanceCache.userId = user.id;
      balanceCache.timestamp = Date.now();
      balanceCache.initialized = true;

      // Notify all listeners
      listeners.forEach(cb => cb(newBalance));

      console.log(`[UserBalance] ✅ Cached balance: ${newBalance}`);
    } catch (e) {
      console.error('[UserBalance] Failed:', e);
    } finally {
      balanceCache.loading = false;
      balanceFetchPromise = null;
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
export async function getBalanceWithFetch(): Promise<number> {
  if (
    balanceCache.initialized &&
    Date.now() - balanceCache.timestamp < CACHE_DURATION
  ) {
    return balanceCache.balance;
  }
  return fetchBalance();
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
export function useUserBalancePrefetch(): void {
  const prefetched = useRef(false);

  useEffect(() => {
    if (prefetched.current) return;
    prefetched.current = true;

    // Prefetch after a small delay to not block initial render
    const timer = setTimeout(() => {
      fetchBalance();
    }, 300);

    // `profiles` is deliberately NOT in supabase_realtime publication.
    // Server-side balance changes arrive through app_sync rows on the approved
    // notifications channel, keeping My Diamond/My Beans instant without adding
    // a costly profiles realtime subscription.
    const handleAppSync = async (event: Event) => {
      const detail = (event as CustomEvent<{ topic?: string; payload?: Record<string, any> }>).detail;
      if (detail?.topic !== 'profiles') return;

      const payload = detail.payload || {};
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || (payload.profile_id && payload.profile_id !== userId)) return;

      const coins = payload.coins;
      const diamonds = payload.diamonds;
      if (coins !== undefined || diamonds !== undefined) {
        balanceCache.userId = userId;
        updateCachedBalance(Math.max(Number(coins || 0), Number(diamonds || 0)));
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
        setTimeout(() => void fetchBalance(), 0);
      }
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener('app-sync', handleAppSync as EventListener);
      authListener.subscription.unsubscribe();
    };
  }, []);
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