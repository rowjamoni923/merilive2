/**
 * Rate Limiter Hook
 * Prevents API abuse by limiting requests per user/IP
 * Uses database-level rate limiting via check_rate_limit RPC
 */

import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RateLimitResult {
  allowed: boolean;
  current_count: number;
  max_requests: number;
  window_seconds: number;
  retry_after: number;
}

interface RateLimitConfig {
  maxRequests?: number;
  windowSeconds?: number;
  showToast?: boolean;
}

// Client-side cache to avoid unnecessary DB calls
const clientCache = new Map<string, { count: number; resetAt: number }>();

export function useRateLimiter() {
  const pendingRef = useRef(false);

  /**
   * Quick client-side check before hitting DB
   */
  const clientSideCheck = useCallback((key: string, max: number, windowMs: number): boolean => {
    const now = Date.now();
    const cached = clientCache.get(key);

    if (!cached || now >= cached.resetAt) {
      clientCache.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    cached.count++;
    return cached.count <= max;
  }, []);

  /**
   * Check rate limit for an action
   * Returns true if allowed, false if rate limited
   */
  const checkRateLimit = useCallback(async (
    actionType: string,
    config: RateLimitConfig = {}
  ): Promise<boolean> => {
    const { maxRequests = 60, windowSeconds = 60, showToast = true } = config;

    // Get identifier (user ID or fallback)
    const { data: { session } } = await supabase.auth.getSession();
    const identifier = session?.user?.id || 'anonymous';
    const cacheKey = `${identifier}:${actionType}`;

    // Fast client-side check first
    if (!clientSideCheck(cacheKey, maxRequests, windowSeconds * 1000)) {
      if (showToast) {
        toast.error('⚠️ Too many requests. Please wait a moment.');
      }
      return false;
    }

    // Skip DB check if already pending
    if (pendingRef.current) return true;

    try {
      pendingRef.current = true;
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_identifier: identifier,
        p_action_type: actionType,
        p_max_requests: maxRequests,
        p_window_seconds: windowSeconds,
      });

      if (error) {
        console.error('[RateLimit] DB check failed:', error);
        return true; // Allow on error (fail open)
      }

      const result = data as unknown as RateLimitResult;

      if (!result.allowed && showToast) {
        toast.error(`⚠️ Rate limited. Try again in ${result.retry_after}s.`);
      }

      return result.allowed;
    } catch (err) {
      console.error('[RateLimit] Error:', err);
      return true; // Fail open
    } finally {
      pendingRef.current = false;
    }
  }, [clientSideCheck]);

  /**
   * Pre-configured limiters for common actions
   */
  const limiters = {
    giftSend: () => checkRateLimit('gift_send', { maxRequests: 30, windowSeconds: 60 }),
    diamondTransfer: () => checkRateLimit('diamond_transfer', { maxRequests: 10, windowSeconds: 60 }),
    message: () => checkRateLimit('message_send', { maxRequests: 60, windowSeconds: 60 }),
    login: () => checkRateLimit('login_attempt', { maxRequests: 5, windowSeconds: 300 }),
    apiCall: () => checkRateLimit('api_call', { maxRequests: 100, windowSeconds: 60 }),
    profileUpdate: () => checkRateLimit('profile_update', { maxRequests: 10, windowSeconds: 60 }),
  };

  return { checkRateLimit, limiters };
}
