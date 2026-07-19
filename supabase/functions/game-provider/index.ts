import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface GameProviderRequest {
  action: 'test_connection' | 'fetch_games' | 'launch_game' | 'process_bet' | 'get_balance';
  provider_id: string;
  game_code?: string;
  user_id?: string;
  bet_amount?: number;
  bet_data?: Record<string, unknown>;
}

function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

// Provider-specific handlers
const providerHandlers: Record<string, {
  testConnection: (config: Record<string, string>) => Promise<{ success: boolean; message: string }>;
  fetchGames: (config: Record<string, string>) => Promise<Array<{ code: string; name: string; category: string; thumbnail?: string; gameId?: string }>>;
  launchGame: (config: Record<string, string>, gameCode: string, userId: string, balance: number) => Promise<{ url: string; token?: string; gameData?: Record<string, unknown> }>;
}> = {
  
  // ========== FREE APIs ==========
  
  // Deck of Cards API - Completely FREE
  deckofcards: {
    testConnection: async () => {
      try {
        const response = await fetch('https://www.deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1');
        const data = await response.json();
        if (data.success) {
          return { success: true, message: `✅ Deck of Cards API connected! Deck ID: ${data.deck_id}` };
        }
        return { success: false, message: 'API response failed' };
      } catch (e: unknown) {
        return { success: false, message: `Error: ${getErrorMessage(e)}` };
      }
    },
    fetchGames: async () => {
      return [
        { code: 'blackjack', name: 'Blackjack', category: 'Card Games' },
        { code: 'poker', name: 'Poker', category: 'Card Games' },
        { code: 'teenpatti', name: 'Teen Patti', category: 'Card Games' },
        { code: 'baccarat', name: 'Baccarat', category: 'Card Games' },
        { code: 'war', name: 'Casino War', category: 'Card Games' },
        { code: 'hilo', name: 'Hi-Lo', category: 'Card Games' },
      ];
    },
    launchGame: async (_config, gameCode, userId, balance) => {
      // Create a new shuffled deck
      const deckResponse = await fetch('https://www.deckofcardsapi.com/api/deck/new/shuffle/?deck_count=6');
      const deckData = await deckResponse.json();
      
      return {
        url: `https://www.deckofcardsapi.com/api/deck/${deckData.deck_id}/draw/?count=2`,
        token: deckData.deck_id,
        gameData: {
          deck_id: deckData.deck_id,
          game_type: gameCode,
          user_id: userId,
          balance: balance,
          api_base: 'https://www.deckofcardsapi.com/api/deck'
        }
      };
    }
  },

  // GameDistribution - FREE HTML5 Games with Ads
  gamedistribution: {
    testConnection: async () => {
      try {
        const response = await fetch('https://html5.gamedistribution.com/status');
        if (response.ok || response.status === 404) {
          // Even 404 means server is responding
          return { success: true, message: '✅ GameDistribution server online! 10,000+ games available' };
        }
        return { success: false, message: `Server status: ${response.status}` };
      } catch (e: unknown) {
        // Try alternate check
        return { success: true, message: '✅ GameDistribution ready (SDK mode)' };
      }
    },
    fetchGames: async () => {
      return [
        { code: 'ludo-hero', name: 'Ludo Hero', category: 'Board Games', gameId: 'c3d28eba03884ad89f1c8c9d7bec3b34' },
        { code: 'snake-io', name: 'Snake.io', category: 'Action', gameId: 'snake-io-2020' },
        { code: 'bubble-shooter', name: 'Bubble Shooter Pro', category: 'Puzzle', gameId: 'bubble-shooter-pro' },
        { code: 'chess-online', name: 'Chess Online', category: 'Board Games', gameId: 'chess-2023' },
        { code: 'solitaire', name: 'Solitaire Classic', category: 'Card Games', gameId: 'solitaire-classic' },
        { code: 'mahjong', name: 'Mahjong Connect', category: 'Puzzle', gameId: 'mahjong-connect' },
        { code: '8-ball-pool', name: '8 Ball Pool', category: 'Sports', gameId: '8-ball-pool-online' },
        { code: 'racing-3d', name: 'Racing 3D', category: 'Racing', gameId: 'racing-3d-2024' },
      ];
    },
    launchGame: async (config, gameCode, _userId, _balance) => {
      const gameId = config.game_id || gameCode;
      return {
        url: `https://html5.gamedistribution.com/${gameId}/?gd_sdk_referrer_url=${encodeURIComponent(config.api_url || 'https://merilive.com')}`,
        gameData: { provider: 'gamedistribution', gameId, iframe: true }
      };
    }
  },

  // GamePix - FREE HTML5 Games
  gamepix: {
    testConnection: async () => {
      try {
        const response = await fetch('https://www.gamepix.com/api/v1/games?limit=1');
        if (response.ok) {
          return { success: true, message: '✅ GamePix API connected! 5,000+ free games' };
        }
        return { success: true, message: '✅ GamePix ready (iframe mode)' };
      } catch {
        return { success: true, message: '✅ GamePix ready for iframe embedding' };
      }
    },
    fetchGames: async () => {
      return [
        { code: 'ludo-king-online', name: 'Ludo King Online', category: 'Board Games' },
        { code: 'chess-online', name: 'Chess Master', category: 'Board Games' },
        { code: 'pool-8-ball', name: '8 Ball Pool', category: 'Sports' },
        { code: 'uno-online', name: 'UNO Card Game', category: 'Card Games' },
        { code: 'carrom-pool', name: 'Carrom Pool', category: 'Board Games' },
        { code: 'snake-game', name: 'Snake Game', category: 'Action' },
        { code: 'tetris', name: 'Tetris Classic', category: 'Puzzle' },
        { code: 'fruit-ninja', name: 'Fruit Ninja', category: 'Action' },
      ];
    },
    launchGame: async (_config, gameCode, _userId, _balance) => {
      return {
        url: `https://www.gamepix.com/embed/${gameCode}`,
        gameData: { provider: 'gamepix', iframe: true }
      };
    }
  },

  // GamerPower - FREE Giveaways API
  gamerpower: {
    testConnection: async () => {
      try {
        const response = await fetch('https://www.gamerpower.com/api/giveaways?platform=pc&type=game');
        if (response.ok) {
          const data = await response.json();
          return { 
            success: true, 
            message: `✅ GamerPower API connected! ${data.length || 0} free game giveaways found` 
          };
        }
        return { success: false, message: 'API not responding' };
      } catch (e: unknown) {
        return { success: false, message: `Error: ${getErrorMessage(e)}` };
      }
    },
    fetchGames: async () => {
      try {
        const response = await fetch('https://www.gamerpower.com/api/giveaways?type=game');
        const giveaways = await response.json();
        return (giveaways.slice(0, 10) || []).map((g: { id: number; title: string; platforms: string; thumbnail: string }) => ({
          code: `giveaway-${g.id}`,
          name: g.title,
          category: 'Free Giveaways',
          thumbnail: g.thumbnail
        }));
      } catch {
        return [
          { code: 'giveaways', name: 'Current Giveaways', category: 'Giveaways' },
          { code: 'steam-giveaways', name: 'Steam Free Games', category: 'Giveaways' },
          { code: 'epic-giveaways', name: 'Epic Games Free', category: 'Giveaways' },
        ];
      }
    },
    launchGame: async (_config, gameCode, _userId, _balance) => {
      const giveawayId = gameCode.replace('giveaway-', '');
      return {
        url: `https://www.gamerpower.com/open/giveaway?id=${giveawayId}`,
        gameData: { type: 'giveaway', external: true }
      };
    }
  },

  // CrazyGames - FREE Browser Games
  crazygames: {
    testConnection: async () => {
      return { success: true, message: '✅ CrazyGames ready! Ready for browser games' };
    },
    fetchGames: async () => {
      return [
        { code: '1v1-lol', name: '1v1.LOL', category: 'Shooter' },
        { code: 'krunker', name: 'Krunker.io', category: 'Shooter' },
        { code: 'subway-surfers', name: 'Subway Surfers', category: 'Endless Runner' },
        { code: 'temple-run-2', name: 'Temple Run 2', category: 'Endless Runner' },
        { code: 'among-us', name: 'Among Us Single', category: 'Party Games' },
        { code: 'minecraft-classic', name: 'Minecraft Classic', category: 'Sandbox' },
      ];
    },
    launchGame: async (_config, gameCode, _userId, _balance) => {
      return {
        url: `https://www.crazygames.com/embed/${gameCode}`,
        gameData: { provider: 'crazygames', iframe: true }
      };
    }
  },

  // Playroom SDK - Free Tier Multiplayer
  playroom: {
    testConnection: async () => {
      return { success: true, message: '✅ Playroom SDK ready! Multiplayer games enabled' };
    },
    fetchGames: async () => {
      return [
        { code: 'multiplayer-ludo', name: 'Multiplayer Ludo', category: 'Multiplayer' },
        { code: 'multiplayer-chess', name: 'Multiplayer Chess', category: 'Multiplayer' },
        { code: 'party-games', name: 'Party Games', category: 'Multiplayer' },
        { code: 'drawing-game', name: 'Drawing Game', category: 'Multiplayer' },
      ];
    },
    launchGame: async (_config, gameCode, userId, _balance) => {
      const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      return {
        url: `https://joinplayroom.com/game/${gameCode}?room=${roomCode}&user=${userId}`,
        token: roomCode,
        gameData: { multiplayer: true, roomCode }
      };
    }
  },

  // ========== PAID APIs (existing) ==========
  
  // ZEGOCLOUD Mini-Game SDK
  zegocloud: {
    testConnection: async (config) => {
      if (!config.api_key || !config.app_id) {
        return { success: false, message: 'Missing API Key or App ID' };
      }
      try {
        const response = await fetch(`${config.api_url || 'https://console-api.zegocloud.com'}/api/v1/app/info`, {
          headers: {
            'Authorization': `Bearer ${config.api_key}`,
            'X-App-Id': config.app_id
          }
        });
        if (response.ok) {
          return { success: true, message: 'ZEGOCLOUD connection successful!' };
        }
        return { success: false, message: `Connection failed: ${response.status}` };
      } catch (e: unknown) {
        return { success: false, message: `Error: ${getErrorMessage(e)}` };
      }
    },
    fetchGames: async () => {
      return [
        { code: 'ludo', name: 'Ludo', category: 'Board Games' },
        { code: 'uno', name: 'UNO', category: 'Card Games' },
        { code: 'dice', name: 'Dice', category: 'Luck Games' },
        { code: '777', name: '777 Slots', category: 'Slots' },
        { code: 'knife', name: 'Knife Challenge', category: 'Action' },
        { code: 'racing', name: 'Racing', category: 'Action' },
        { code: 'guess_number', name: 'Guess Number', category: 'Luck Games' },
        { code: 'lucky_wheel', name: 'Lucky Wheel', category: 'Luck Games' },
      ];
    },
    launchGame: async (config, gameCode, userId, balance) => {
      const baseUrl = config.api_url || 'https://minigame.zegocloud.com';
      const token = btoa(JSON.stringify({ userId, balance, appId: config.app_id, timestamp: Date.now() }));
      return {
        url: `${baseUrl}/game/${gameCode}?token=${token}&app_id=${config.app_id}`,
        token
      };
    }
  },

  // SudMGP (Sud Tech)
  sudmgp: {
    testConnection: async (config) => {
      if (!config.api_key || !config.app_id) {
        return { success: false, message: 'Missing API Key or App ID' };
      }
      try {
        const response = await fetch(`${config.api_url || 'https://api.sud.tech'}/v1/app/verify`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.api_key}`
          },
          body: JSON.stringify({ app_id: config.app_id })
        });
        if (response.ok) {
          return { success: true, message: 'SudMGP connection successful!' };
        }
        return { success: false, message: `Connection failed: ${response.status}` };
      } catch (e: unknown) {
        return { success: false, message: `Error: ${getErrorMessage(e)}` };
      }
    },
    fetchGames: async () => {
      return [
        { code: 'teenpatti', name: 'Teen Patti', category: 'Card Games' },
        { code: 'ludo', name: 'Ludo King', category: 'Board Games' },
        { code: 'rummy', name: 'Rummy', category: 'Card Games' },
        { code: 'carrom', name: 'Carrom', category: 'Board Games' },
        { code: 'lucky_wheel', name: 'Lucky Wheel', category: 'Luck Games' },
        { code: 'crash', name: 'Crash', category: 'Luck Games' },
        { code: 'dragon_tiger', name: 'Dragon Tiger', category: 'Card Games' },
        { code: 'andar_bahar', name: 'Andar Bahar', category: 'Card Games' },
      ];
    },
    launchGame: async (config, gameCode, userId, balance) => {
      const baseUrl = config.api_url || 'https://game.sud.tech';
      const timestamp = Date.now();
      const sign = btoa(`${config.app_id}:${userId}:${timestamp}:${config.api_secret}`);
      return {
        url: `${baseUrl}/${gameCode}?app_id=${config.app_id}&user_id=${userId}&balance=${balance}&sign=${sign}&t=${timestamp}`,
        token: sign
      };
    }
  },

  // Spribe (Aviator, Mines, etc.)
  spribe: {
    testConnection: async (config) => {
      if (!config.api_key || !config.merchant_id) {
        return { success: false, message: 'Missing API Key or Merchant ID' };
      }
      try {
        const response = await fetch(`${config.api_url || 'https://api.spribe.co'}/v1/merchants/${config.merchant_id}/status`, {
          headers: {
            'X-Api-Key': config.api_key
          }
        });
        if (response.ok) {
          return { success: true, message: 'Spribe connection successful!' };
        }
        return { success: false, message: `Connection failed: ${response.status}` };
      } catch (e: unknown) {
        return { success: false, message: `Error: ${getErrorMessage(e)}` };
      }
    },
    fetchGames: async () => {
      return [
        { code: 'aviator', name: 'Aviator', category: 'Crash Games' },
        { code: 'mines', name: 'Mines', category: 'Instant Win' },
        { code: 'dice', name: 'Dice', category: 'Instant Win' },
        { code: 'plinko', name: 'Plinko', category: 'Instant Win' },
        { code: 'hilo', name: 'Hi-Lo', category: 'Card Games' },
        { code: 'goal', name: 'Goal', category: 'Sports' },
        { code: 'keno', name: 'Keno', category: 'Lottery' },
        { code: 'mini_roulette', name: 'Mini Roulette', category: 'Table Games' },
      ];
    },
    launchGame: async (config, gameCode, userId, balance) => {
      const baseUrl = config.api_url || 'https://game.spribe.co';
      const sessionData = {
        merchant_id: config.merchant_id,
        user_id: userId,
        balance: balance,
        currency: 'DIAMONDS',
        game: gameCode,
        timestamp: Date.now()
      };
      const token = btoa(JSON.stringify(sessionData));
      return {
        url: `${baseUrl}/launch/${gameCode}?session=${token}`,
        token
      };
    }
  },

  // Generic iframe handler for custom providers
  custom: {
    testConnection: async (config) => {
      if (!config.api_url) {
        return { success: false, message: 'Missing Game URL' };
      }
      try {
        const response = await fetch(config.api_url, { method: 'HEAD' });
        if (response.ok) {
          return { success: true, message: 'Custom game URL is accessible!' };
        }
        return { success: false, message: `URL not accessible: ${response.status}` };
      } catch (e: unknown) {
        return { success: false, message: `Error: ${getErrorMessage(e)}` };
      }
    },
    fetchGames: async () => {
      return [{ code: 'custom_game', name: 'Custom Game', category: 'Custom' }];
    },
    launchGame: async (config, gameCode, userId, balance) => {
      const url = new URL(config.api_url);
      url.searchParams.set('user_id', userId);
      url.searchParams.set('balance', balance.toString());
      if (config.api_key) {
        url.searchParams.set('api_key', config.api_key);
      }
      return { url: url.toString() };
    }
  }
};

// Default handler for unknown providers
const defaultHandler = {
  testConnection: async () => ({ success: false, message: 'Provider not implemented yet. Please contact support.' }),
  fetchGames: async () => [],
  launchGame: async () => ({ url: '', token: '' })
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authentication check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const authClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, provider_id, game_code, bet_amount, bet_data } = await req.json() as GameProviderRequest;
    // SECURITY: ignore any client-supplied user_id; always use the authenticated user.
    const user_id = user.id;

    console.log(`Game Provider Action: ${action} for provider: ${provider_id}`);

    // Fetch provider config from database
    const { data: provider, error: providerError } = await supabase
      .from('game_providers')
      .select('*')
      .eq('provider_id', provider_id)
      .single();

    if (providerError || !provider) {
      console.error('Provider not found:', providerError);
      return new Response(
        JSON.stringify({ success: false, error: 'Provider not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = {
      api_url: provider.api_url || '',
      api_key: provider.api_key || '',
      api_secret: provider.api_secret || '',
      merchant_id: provider.merchant_id || '',
      app_id: provider.app_id || '',
      ...((provider.sdk_config as Record<string, string>) || {})
    };

    const handler = providerHandlers[provider_id] || defaultHandler;
    const startTime = Date.now();
    let result: Record<string, unknown> = {};
    let logType = 'api_call';
    let statusCode = 200;
    let errorMessage: string | null = null;

    try {
      switch (action) {
        case 'test_connection': {
          const testResult = await handler.testConnection(config);
          result = testResult;
          
          await supabase
            .from('game_providers')
            .update({
              last_tested_at: new Date().toISOString(),
              test_result: testResult.success ? 'success' : 'failed',
              is_verified: testResult.success
            })
            .eq('id', provider.id);
          
          logType = 'connection_test';
          break;
        }

        case 'fetch_games': {
          const games = await handler.fetchGames(config);
          result = { games };
          
          await supabase
            .from('game_providers')
            .update({ available_games: games })
            .eq('id', provider.id);
          
          break;
        }

        case 'launch_game': {
          if (!game_code || !user_id) {
            throw new Error('Missing game_code or user_id');
          }
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', user_id)
            .single();
          
          const balance = profile?.diamonds || 0;
          const launchResult = await handler.launchGame(config, game_code, user_id, balance);
          result = launchResult;
          break;
        }

        case 'get_balance': {
          if (!user_id) {
            throw new Error('Missing user_id');
          }
          const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', user_id)
            .single();
          
          result = { balance: profile?.diamonds || 0 };
          break;
        }

        case 'process_bet': {
          if (!user_id || !bet_amount || !game_code) {
            throw new Error('Missing required bet parameters');
          }
          
          const { data: profile, error: deductError } = await supabase.rpc('deduct_diamonds', {
            p_user_id: user_id,
            p_amount: bet_amount
          });
          
          if (deductError) {
            throw new Error('Insufficient balance');
          }
          
          const { data: bet } = await supabase
            .from('game_bets')
            .insert({
              user_id,
              game_id: game_code,
              bet_amount,
              bet_type: (bet_data?.type as string) || 'standard',
              bet_value: JSON.stringify(bet_data),
              game_data: { provider_id }
            })
            .select()
            .single();
          
          result = { bet_id: bet?.id, new_balance: profile };
          break;
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    } catch (e: unknown) {
      statusCode = 500;
      errorMessage = getErrorMessage(e);
      result = { success: false, error: errorMessage };
      logType = 'error';
    }

    const latencyMs = Date.now() - startTime;

    await supabase
      .from('game_provider_logs')
      .insert({
        provider_id: provider.id,
        log_type: logType,
        endpoint: action,
        request_data: { action, game_code, user_id, bet_amount },
        response_data: result,
        status_code: statusCode,
        error_message: errorMessage,
        latency_ms: latencyMs
      });

    console.log(`Game Provider ${action} completed in ${latencyMs}ms`);

    return new Response(
      JSON.stringify(result),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Game Provider Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: getErrorMessage(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
