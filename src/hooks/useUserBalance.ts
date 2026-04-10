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
}

const balanceCache: BalanceCache = {
  balance: 0,
  userId: null,
  timestamp: 0,
  loading: false,
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
    // Use getSession (local) instead of getUser (network) for speed
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      balanceCache.loading = false;
      return 0;
    }

    // Return cached if valid
    if (
      balanceCache.userId === user.id &&
      balanceCache.balance > 0 &&
      Date.now() - balanceCache.timestamp < CACHE_DURATION
    ) {
      balanceCache.loading = false;
      return balanceCache.balance;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('[UserBalance] Error:', error);
      balanceCache.loading = false;
      return balanceCache.balance;
    }

    const newBalance = profile?.coins || 0;
    balanceCache.balance = newBalance;
    balanceCache.userId = user.id;
    balanceCache.timestamp = Date.now();

    // Notify all listeners
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
    balanceCache.balance > 0 &&
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

    // Set up realtime subscription for balance updates
    const setupRealtimeBalance = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;

      const channel = supabase
        .channel('user-balance-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${user.id}`,
          },
          (payload) => {
            const newBalance = (payload.new as { coins?: number })?.coins || 0;
            updateCachedBalance(newBalance);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    setupRealtimeBalance();

    return () => clearTimeout(timer);
  }, []);
}

/**
 * Hook to use cached balance with real-time updates
 */
export function useUserBalance() {
  const [balance, setBalance] = useState(getCachedBalance());
  const [loading, setLoading] = useState(balanceCache.balance === 0);

  useEffect(() => {
    // Subscribe to balance updates
    const unsubscribe = subscribeToBalance((newBalance) => {
      setBalance(newBalance);
      setLoading(false);
    });

    // Fetch if not cached
    if (balanceCache.balance === 0) {
      getBalanceWithFetch().then((b) => {
        setBalance(b);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return unsubscribe;
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