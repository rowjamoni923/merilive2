/**
 * Hook to get game logos from Admin Panel (game_settings table)
 * Used in: Game selection, Win messages, Game board headers
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GameLogo {
  game_id: string;
  game_name: string;
  logo_url: string | null;
  game_emoji: string;
}

// Global cache for game logos
let globalGameLogos: Map<string, GameLogo> = new Map();
let isInitialized = false;

// Initialize and fetch game logos - now returns a promise that can be awaited
let initPromise: Promise<void> | null = null;

const initializeGameLogos = async () => {
  if (isInitialized && globalGameLogos.size > 0) return;
  
  try {
    const { data, error } = await supabase
      .from('game_settings')
      .select('game_id, game_name, logo_url, game_emoji')
      .eq('is_active', true);
    
    if (error) {
      console.error('[useGameLogos] Error fetching logos:', error);
      return;
    }
    
    if (data) {
      globalGameLogos.clear();
      data.forEach((game: any) => {
        // Normalize game_id for matching (handle both formats)
        const normalizedId = game.game_id.toLowerCase().replace(/-/g, '_');
        const gameData = {
          game_id: game.game_id,
          game_name: game.game_name,
          logo_url: game.logo_url,
          game_emoji: game.game_emoji || '🎮',
        };
        
        // Store with multiple key formats for easy lookup
        globalGameLogos.set(normalizedId, gameData);
        globalGameLogos.set(game.game_id, gameData);
        globalGameLogos.set(game.game_id.toLowerCase(), gameData);
        globalGameLogos.set(game.game_name.toLowerCase().replace(/\s+/g, '_'), gameData);
      });
      isInitialized = true;
      console.log('[useGameLogos] Loaded', data.length, 'games with', globalGameLogos.size, 'key variants');
    }
  } catch (err) {
    console.error('[useGameLogos] Exception:', err);
  }
};

// Ensure initialization happens before any access
const ensureInitialized = async () => {
  if (!initPromise) {
    initPromise = initializeGameLogos();
  }
  await initPromise;
};

// Get logo for a specific game
export const getGameLogo = (gameKey: string): GameLogo | null => {
  if (!isInitialized) return null; // Return null if not yet loaded
  const normalizedKey = gameKey.toLowerCase().replace(/-/g, '_');
  return globalGameLogos.get(normalizedKey) || 
         globalGameLogos.get(gameKey) || 
         null;
};

// Get logo URL directly
export const getGameLogoUrl = (gameKey: string): string | null => {
  const logo = getGameLogo(gameKey);
  return logo?.logo_url || null;
};

// Get emoji for a game
export const getGameEmoji = (gameKey: string): string => {
  const logo = getGameLogo(gameKey);
  return logo?.game_emoji || '🎮';
};

// Hook to use game logos with real-time updates
export const useGameLogos = () => {
  const [logos, setLogos] = useState<Map<string, GameLogo>>(new Map(globalGameLogos));
  const [loading, setLoading] = useState(!isInitialized);

  useEffect(() => {
    const init = async () => {
      await initializeGameLogos();
      setLogos(new Map(globalGameLogos));
      setLoading(false);
    };
    
    init();
    
    // Pkg83-ext: removed static `game-logos-realtime` channel.
    // Pkg37 admin_broadcast pushes game_settings edits.
    const onAdmin = async (e: Event) => {
      const table = (e as CustomEvent<{ table?: string }>).detail?.table;
      if (table !== 'game_settings') return;
      isInitialized = false;
      await initializeGameLogos();
      setLogos(new Map(globalGameLogos));
    };
    window.addEventListener('admin-table-update', onAdmin as EventListener);

    return () => {
      window.removeEventListener('admin-table-update', onAdmin as EventListener);
    };

  }, []);

  const getLogo = useCallback((gameKey: string): GameLogo | null => {
    const normalizedKey = gameKey.toLowerCase().replace(/-/g, '_');
    return logos.get(normalizedKey) || logos.get(gameKey) || null;
  }, [logos]);

  const getLogoUrl = useCallback((gameKey: string): string | null => {
    return getLogo(gameKey)?.logo_url || null;
  }, [getLogo]);

  const getEmoji = useCallback((gameKey: string): string => {
    return getLogo(gameKey)?.game_emoji || '🎮';
  }, [getLogo]);

  return { 
    logos, 
    loading, 
    getLogo, 
    getLogoUrl, 
    getEmoji,
    allLogos: Array.from(logos.values()),
  };
};

// Lazy initialization - only loads when first needed (not on import)
// Call ensureInitialized() before using getGameLogo/getGameLogoUrl/getGameEmoji

export default useGameLogos;
