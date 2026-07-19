/**
 * GAME TOKEN HOOK
 * 
 * Generates session tokens for external game providers.
 * Token is auto-generated when user opens an external game,
 * and injected into the iframe URL for balance integration.
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GameToken {
  token: string;
  balance: number;
  merchant_id: string;
}

// Module-level cache to avoid regenerating tokens for same game
const tokenCache = new Map<string, { token: GameToken; timestamp: number }>();
const TOKEN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function useGameToken() {
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Promise<GameToken | null> | null>(null);

  const generateToken = useCallback(async (
    gameId?: string,
    roomId?: string,
    merchantId?: string,
  ): Promise<GameToken | null> => {
    const cacheKey = `${gameId || 'default'}_${roomId || ''}`;
    
    // Check cache
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TOKEN_CACHE_TTL) {
      return cached.token;
    }

    // Deduplicate concurrent calls
    if (pendingRef.current) return pendingRef.current;

    setLoading(true);
    const promise = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('game-token', {
          body: {
            game_id: gameId,
            room_id: roomId,
            merchant_id: merchantId || '1000000',
          },
        });

        if (error) {
          console.error('[GameToken] Error:', error);
          return null;
        }

        if (data?.success && data?.token) {
          const tokenData: GameToken = {
            token: data.token,
            balance: data.balance,
          };
          tokenCache.set(cacheKey, { token: tokenData, timestamp: Date.now() });
          return tokenData;
        }

        console.error('[GameToken] Invalid response:', data);
        return null;
      } catch (err) {
        console.error('[GameToken] Failed:', err);
        return null;
      } finally {
        setLoading(false);
        pendingRef.current = null;
      }
    })();

    pendingRef.current = promise;
    return promise;
  }, []);

  /**
   * Build game URL with token injected
   * Supports gamesp.ccdn.ink format and generic format
   */
  const buildGameUrl = useCallback(async (
    baseUrl: string,
  ): Promise<string> => {
    const tokenData = await generateToken(gameId, roomId, merchantId);
    
    if (!tokenData) {
      // Fallback: return original URL
      return baseUrl;
    }

    try {
      const url = new URL(baseUrl);
      
      // Inject params matching game provider's expected format
      if (!url.searchParams.has('token')) {
        url.searchParams.set('token', tokenData.token);
      }
      // Provider expects 'merchant' (not 'merchantId')
      if (!url.searchParams.has('merchant') && !url.searchParams.has('merchantId')) {
        url.searchParams.set('merchant', tokenData.merchant_id);
      }
      if (gameId && !url.searchParams.has('gameId')) {
        url.searchParams.set('gameId', gameId);
      }
      if (roomId && !url.searchParams.has('roomId')) {
        url.searchParams.set('roomId', roomId);
      }
      // Add landscape mode for mobile
      if (!url.searchParams.has('isLandscape')) {
        url.searchParams.set('isLandscape', 'true');
      }

      return url.toString();
    } catch {
      // If URL parsing fails, append as query string
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}token=${tokenData.token}&merchant=${tokenData.merchant_id}&isLandscape=true`;
    }
  }, [generateToken]);

  const clearTokenCache = useCallback(() => {
    tokenCache.clear();
  }, []);

  return {
    generateToken,
    buildGameUrl,
    clearTokenCache,
    loading,
  };
}
