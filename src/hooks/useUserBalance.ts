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

/**
 * Fetch user balance and update cache
 */
async function fetchBalance(): Promise<number> {
  // Prevent duplicate fetches
  if (balanceCache.loading) {
    return balanceCache.balance;
  }

  balanceCache.loading = true;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;

    if (!user) {
      balanceCache.balance = 0;
      balanceCache.userId = null;
      balanceCache.timestamp = Date.now();
      balanceCache.initialized = true;
      listeners.forEach(cb => cb(0));
      return 0;
    }

    if (
      balanceCache.userId === user.id &&
      balanceCache.initialized &&
      Date.now() - balanceCache.timestamp < CACHE_DURATION
    ) {
      return balanceCache.balance;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[UserBalance] Error:', error);
      return balanceCache.balance;
    }

    const newBalance = Number(profile?.coins ?? 0);
    balanceCache.balance = newBalance;
    balanceCache.userId = user.id;
    balanceCache.timestamp = Date.now();
    balanceCache.initialized = true;

    listeners.forEach(cb => cb(newBalance));

    console.log(`[UserBalance] ✅ Cached balance: ${newBalance}`);
  } catch (e) {
    console.error('[UserBalance] Failed:', e);
  } finally {
    balanceCache.loading = false;
  }

  return balanceCache.balance;
}

/**
 * Get cached balance synchronously
 */
export function getCachedBalance(): number {
  return balanceCache.balance;
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
  balanceCache.balance = Number(newBalance ?? 0);
  balanceCache.timestamp = Date.now();
  balanceCache.initialized = true;
  listeners.forEach(cb => cb(balanceCache.balance));
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

    let balanceChannel: ReturnType<typeof supabase.channel> | null = null;

    const syncBalance = async (userId?: string | null) => {
      if (balanceChannel) {
        supabase.removeChannel(balanceChannel);
        balanceChannel = null;
      }

      if (!userId) {
        clearBalanceCache();
        listeners.forEach(cb => cb(0));
        return;
      }

      await fetchBalance();

      balanceChannel = supabase
        .channel(`user-balance-updates-${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${userId}`,
          },
          (payload) => {
            const newBalance = Number((payload.new as { coins?: number })?.coins ?? 0);
            updateCachedBalance(newBalance);
          }
        )
        .subscribe();
    };

    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await syncBalance(session?.user?.id ?? null);
    }, 300);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncBalance(session?.user?.id ?? null);
    });

    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
      if (balanceChannel) {
        supabase.removeChannel(balanceChannel);
      }
    };
  }, []);
}

/**
 * Hook to use cached balance with real-time updates
 */
export function useUserBalance() {
  const [balance, setBalance] = useState(getCachedBalance());
  const [loading, setLoading] = useState(!balanceCache.initialized);

  useEffect(() => {
    const unsubscribe = subscribeToBalance((newBalance) => {
      setBalance(newBalance);
      setLoading(false);
    });

    if (!balanceCache.initialized) {
      getBalanceWithFetch().then((b) => {
        setBalance(b);
        setLoading(false);
      });
    } else {
      setBalance(balanceCache.balance);
      setLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearBalanceCache();
        setBalance(0);
        setLoading(false);
        return;
      }

      setLoading(true);
      void fetchBalance().then((newBalance) => {
        setBalance(newBalance);
        setLoading(false);
      });
    });

    return () => {
      unsubscribe();
      subscription.unsubscribe();
    };
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    const newBalance = await fetchBalance();
    setBalance(newBalance);
    setLoading(false);
    return newBalance;
  }, []);

  return {
    balance,
    loading,
    refetch,
  };
}

export default useUserBalance;
