import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserBalance, updateCachedBalance } from "@/hooks/useUserBalance";
import { useGameToken } from "@/hooks/useGameToken";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { 
  Coins, 
  Trophy, 
  Loader2, 
  Users,
  Clock,
  ChevronDown,
  X,
  Sparkles,
  TrendingUp,
  Gift,
  Settings,
  Volume2,
  VolumeX,
  HelpCircle,
  History,
  BarChart3,
  Gamepad2
} from "lucide-react";
import { useLiveGameRound } from "@/hooks/useLiveGameRound";
import { sendGameWinNotification } from "@/services/gameWinNotificationService";
import { stopAllGameSounds } from "@/hooks/useGameSoundManager";
// LiveGame3DStage removed — 3D visuals now live INSIDE each game (wheel/board) per spec
import { LiveFerrisWheelGame } from "./live-games/LiveFerrisWheelGame";
import { LiveTeenPattiGame } from "./live-games/LiveTeenPattiGame";
import { LiveLuckyNumberGame } from "./live-games/LiveLuckyNumberGame";
import { LiveRocketRaceGame } from "./live-games/LiveRocketRaceGame";
import { LiveRouletteGame } from "./live-games/LiveRouletteGame";
import { GameCategoryTabs } from "./GameCategoryTabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GameRulesPanel, BetHistoryPanel, GameLeaderboardPanel } from "./panels";

interface GameSetting {
  id: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  description: string;
  min_bet: number;
  max_bet: number;
  win_probability: number;
  max_multiplier: number;
  is_active: boolean;
  rules: any;
  preset_bets?: number[];
  game_url?: string;
  logo_url?: string;
  game_type?: string;
  iframe_width?: number;
  iframe_height?: number;
  category?: string;
  provider_game_code?: string;
}

interface LiveGameBoardProps {
  selectedGame?: string | null;
  roomId?: string;
  onClose?: () => void;
  onOpenGifts?: () => void;
}

// Default preset bets - Updated as per user request
const DEFAULT_PRESET_BETS = [500, 1000, 5000, 10000, 20000];

// Format number for display
const formatBetAmount = (amount: number): string => {
  if (amount >= 100000) {
    return `${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}K`;
  }
  return amount.toString();
};

export function LiveGameBoard({ selectedGame, roomId, onClose, onOpenGifts }: LiveGameBoardProps) {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [activeGame, setActiveGame] = useState<string | null>(selectedGame || 'crash');
  const [loading, setLoading] = useState(true);
  const { balance: diamondBalance, refetch: refetchBalance } = useUserBalance();
  const { buildGameUrl, loading: tokenLoading } = useGameToken();
  const [externalGameUrl, setExternalGameUrl] = useState<string | null>(null);
  const [userCoins, setUserCoins] = useState(0);
  const [betAmount, setBetAmount] = useState(500);
  const [showGameSelector, setShowGameSelector] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<{ username: string; level: number } | null>(null);
  
  // Game timer state - synced from individual game components
  // Using refs to prevent unnecessary re-renders which cause flicker
  const [gameTimeLeft, setGameTimeLeft] = useState(25);
  const [gamePhase, setGamePhase] = useState<'betting' | 'spinning' | 'dealing'>('betting');
  
  // Memoized timer update handler to prevent flicker
  const handleTimerUpdate = useCallback((time: number, phase: 'betting' | 'spinning' | 'dealing') => {
    setGameTimeLeft(time);
    setGamePhase(phase);
  }, []);
  
  // Panel states
  const [showRulesPanel, setShowRulesPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showLeaderboardPanel, setShowLeaderboardPanel] = useState(false);

  // Stop all sounds when game board unmounts or closes
  useEffect(() => {
    return () => {
      stopAllGameSounds();
    };
  }, []);

  // Sync activeGame with selectedGame prop when parent passes a new game
  useEffect(() => {
    if (selectedGame && selectedGame !== activeGame) {
      stopAllGameSounds();
      setActiveGame(selectedGame);
      setExternalGameUrl(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGame]);

  // Stop sounds when switching games
  const handleGameChange = useCallback((gameId: string) => {
    stopAllGameSounds();
    setActiveGame(gameId);
    setExternalGameUrl(null); // Reset token URL when switching games
    setShowGameSelector(false);
  }, []);

  // Get unique categories from games
  const categories = useMemo(() => {
    const cats = new Set(games.map(g => g.category || 'casino'));
    return Array.from(cats);
  }, [games]);

  // Filter games by category
  const filteredGames = useMemo(() => {
    if (activeCategory === 'all') return games;
    return games.filter(g => (g.category || 'casino') === activeCategory);
  }, [games, activeCategory]);


  const {
    currentRound,
    bets,
    myBets,
    timeLeft,
    phase,
    placeBet,
    processResult
  } = useLiveGameRound({
    gameId: activeGame || 'crash',
    roomId: roomId,
    autoStart: true,
    bettingSeconds: 25  // Extended from 15 to 25 seconds
  });

  useEffect(() => {
    fetchGames();
    fetchUserCoins();

    // Real-time subscription for user's coin balance
    const setupCoinSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const channel = supabase
          .channel('game-coin-balance')
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
              filter: `id=eq.${user.id}`
            },
            (payload) => {
              const newCoins = (payload.new as any).coins;
              if (typeof newCoins === 'number') {
                setUserCoins(newCoins);
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(channel);
        };
      }
    };

    const cleanup = setupCoinSubscription();
    
    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, []);

  const fetchGames = async () => {
    try {
      const { data, error } = await supabase
        .from('game_settings')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;
      
      // Parse preset_bets from JSON & ensure game_id falls back to row id (third_party games may have null game_id)
      const gamesWithPresets = (data || []).map(game => ({
        ...game,
        game_id: game.game_id || game.id,
        preset_bets: game.preset_bets ? 
          (typeof game.preset_bets === 'string' ? JSON.parse(game.preset_bets) : game.preset_bets) 
          : DEFAULT_PRESET_BETS
      }));
      
      setGames(gamesWithPresets);

      // ⚡ Auto-select first available game if current activeGame doesn't exist in DB
      if (gamesWithPresets.length > 0) {
        const currentExists = gamesWithPresets.some(g => g.game_id === activeGame);
        if (!currentExists) {
          const fallback = (selectedGame && gamesWithPresets.find(g => g.game_id === selectedGame))
            || gamesWithPresets[0];
          setActiveGame(fallback.game_id);
        }
      }
    } catch (error) {
      console.error('Error fetching games:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserCoins = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data } = await supabase
        .from('profiles')
        .select('coins, username, user_level')
        .eq('id', user.id)
        .single();
      if (data) {
        setUserCoins(data.coins);
        setCurrentUserProfile({
          username: data.username || 'Player',
          level: data.user_level || 1
        });
      }
    }
  };

  // Game win notification handler - includes user name and level
  const handleGameWin = async (winAmount: number, gameName: string, gameEmoji: string) => {
    if (roomId && currentUserId && winAmount > 0) {
      await sendGameWinNotification({
        roomId,
        userId: currentUserId,
        gameName,
        winAmount,
        gameEmoji,
        userName: currentUserProfile?.username,
        userLevel: currentUserProfile?.level
      });
    }
  };

  const handlePlaceBet = async (betType?: string, betValue?: string) => {
    if (phase !== 'betting') {
      toast.error('Betting is closed');
      return null;
    }

    // No bet limit - users can bet any amount they have
    if (betAmount > userCoins) {
      toast.error('Insufficient diamonds');
      return null;
    }

    // Immediately deduct from local state for instant feedback
    const previousCoins = userCoins;
    setUserCoins(prev => prev - betAmount);

    // Place bet without any await delay - fire and forget pattern for instant response
    const result = await placeBet(betAmount, betType, betValue);
    
    if (result.success) {
      // Instant update - bet amount is already shown on selected items
      if (result.new_balance !== undefined) {
        setUserCoins(result.new_balance);
      }
      return result;
    } else {
      // Restore coins if bet failed
      setUserCoins(previousCoins);
      toast.error(result.error || 'Failed to place bet');
      return result;
    }
  };

  const currentGame = games.find(g => g.game_id === activeGame);
  const presetBets = currentGame?.preset_bets || DEFAULT_PRESET_BETS;

  const renderGameComponent = () => {
    if (!activeGame || !currentGame) return null;

    // Games with built-in React components should ALWAYS use them (not external iframe)
    // This ensures they connect to the app's coin system
    const hasBuiltInComponent = [
      'aviator', 'plinko', 'dragon_tiger', 'andar_bahar', 'roulette',
      'baccarat', 'blackjack', 'hilo', 'mines', 'limbo', 'crash',
      'wheel', 'dice', 'coinflip', 'slots', 'lucky28',
      'ferris-wheel', 'ferris_wheel', 'teen-patti', 'teen_patti',
      'lucky_number', 'rocket_race'
    ].includes(activeGame);

    // If game has an external URL and game_type is 'external', AND no built-in component
    const isExternalGame = !hasBuiltInComponent && 
      (currentGame.game_type === 'external' || currentGame.game_type === 'iframe' || currentGame.game_type === 'third_party') && 
      currentGame.game_url?.startsWith('http');
    
    if (isExternalGame) {
      const iframeHeight = currentGame.iframe_height || 700;
      
      // Generate token-injected URL for external games
      if (!externalGameUrl) {
        // For third-party games, use provider_game_code as gameId (numeric)
        const providerGameId = currentGame.provider_game_code || currentGame.game_id;
        buildGameUrl(currentGame.game_url!, providerGameId, roomId).then(url => {
          setExternalGameUrl(url);
        });
        return (
          <div className="w-full flex items-center justify-center" style={{ height: Math.max(iframeHeight, 600) }}>
            <div className="text-center text-white/60">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">Loading game...</p>
            </div>
          </div>
        );
      }

      return (
        <div 
          className="w-full overflow-hidden rounded-lg relative" 
          style={{ height: Math.max(iframeHeight, 600), touchAction: 'auto' }}
        >
          <iframe
            src={externalGameUrl}
            className="absolute inset-0 w-full h-full border-0"
            allow="autoplay; fullscreen; accelerometer; gyroscope; payment"
            allowFullScreen
            title={currentGame.game_name}
            style={{ 
              width: '100%',
              height: '100%',
              pointerEvents: 'auto',
              touchAction: 'auto',
            }}
          />
        </div>
      );
    }

    const gameProps = {
      game: currentGame,
      betAmount,
      setBetAmount,
      userCoins,
      phase,
      timeLeft,
      currentRound,
      bets,
      myBets,
      onPlaceBet: handlePlaceBet,
      onProcessResult: processResult,
      onUpdateCoins: (newBalance: number) => setUserCoins(newBalance),
      onGameWin: (winAmount: number) => handleGameWin(winAmount, currentGame.game_name, currentGame.game_emoji || "🎰")
    };

    switch (activeGame) {
      case 'roulette':
        return <LiveRouletteGame {...gameProps} onUpdateCoins={(newBalance: number) => setUserCoins(newBalance)} onTimerUpdate={handleTimerUpdate} />;
      case 'ferris-wheel':
      case 'ferris_wheel':
        return <LiveFerrisWheelGame {...gameProps} onUpdateCoins={(newBalance: number) => setUserCoins(newBalance)} onTimerUpdate={handleTimerUpdate} />;
      case 'teen-patti':
      case 'teen_patti':
        return <LiveTeenPattiGame {...gameProps} onUpdateCoins={(newBalance: number) => setUserCoins(newBalance)} onTimerUpdate={handleTimerUpdate} />;
      case 'lucky_number':
        return <LiveLuckyNumberGame {...gameProps} onUpdateCoins={(newBalance: number) => setUserCoins(newBalance)} onTimerUpdate={handleTimerUpdate} />;
      case 'rocket_race':
        return <LiveRocketRaceGame {...gameProps} onUpdateCoins={(newBalance: number) => setUserCoins(newBalance)} onTimerUpdate={handleTimerUpdate} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-32 text-white/60">
            <span className="text-4xl mb-2">{currentGame.game_emoji}</span>
            <p className="text-sm font-bold">{currentGame.game_name}</p>
            <p className="text-xs">Coming soon...</p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  // No games available - show setup message
  if (games.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-gradient-to-br from-slate-900/95 via-purple-900/90 to-slate-900/95 backdrop-blur-xl rounded-xl border border-purple-500/30 overflow-hidden p-6"
      >
        <div className="flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center mb-4 border border-purple-500/30">
            <Gamepad2 className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">No Games Available</h3>
          <p className="text-white/60 text-sm mb-4 max-w-xs">
            Games will be added via API integration from the Admin Panel.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs">
              🎮 Agora
            </span>
            <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs">
              🎲 SudMGP
            </span>
            <span className="px-3 py-1 rounded-full bg-orange-500/20 text-orange-300 text-xs">
              ✈️ Spribe
            </span>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="mt-4 text-white/60 hover:text-white"
            >
              <X className="w-4 h-4 mr-1" />
              Close
            </Button>
          )}
        </div>
      </motion.div>
    );
  }

  // Check if current game is external/iframe
  const isCurrentGameExternal = currentGame && 
    (currentGame.game_type === 'external' || currentGame.game_type === 'iframe' || currentGame.game_type === 'third_party') && 
    currentGame.game_url?.startsWith('http');

  return (
    <div className="live-game-shell w-full rounded-xl overflow-hidden relative z-20 pointer-events-auto">
      {/* 3D stage removed — each game renders its own 3D-styled board/wheel inline */}
      {/* Compact Header - HIDDEN for external/iframe games */}
      {!isCurrentGameExternal && (
        <div className="live-game-header flex items-center justify-between p-1.5 border-b border-border/35">
          <div className="flex items-center gap-1">
            {currentGame && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center text-sm shadow-md overflow-hidden relative",
                  `bg-gradient-to-br ${currentGame.game_color}`
                )}
              >
                {currentGame.logo_url ? (
                  <img 
                    src={getProxiedUrl(currentGame.logo_url)} 
                    alt={currentGame.game_name}
                    className="w-full h-full object-cover rounded-md"
                    loading="lazy"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      if (target.nextElementSibling) {
                        (target.nextElementSibling as HTMLElement).style.display = 'block';
                      }
                    }}
                  />
                ) : null}
                <span 
                  className="text-sm emoji-fallback" 
                  style={{ display: currentGame.logo_url ? 'none' : 'block' }}
                >
                  {currentGame.game_emoji}
                </span>
              </motion.div>
            )}
            <div>
              <h3 className="text-white font-bold text-xs leading-tight drop-shadow-sm">
                {currentGame?.game_name || 'Game'}
              </h3>
              <div className="flex items-center gap-1.5 text-[10px] leading-tight">
                <span className="text-white/80 font-semibold">R#{currentRound?.round_number || 0}</span>
                <span className="flex items-center gap-0.5 text-amber-300 font-semibold">
                  <Users className="w-2.5 h-2.5" />
                  {currentRound?.total_players || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            {currentRound && currentRound.total_bet_amount > 0 && (
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 rounded-full">
                <Coins className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-amber-300 font-bold text-[9px]">
                  {currentRound.total_bet_amount.toLocaleString()}
                </span>
              </div>
            )}

            <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/20 rounded-full">
              <Diamond3DIcon size={12} />
              <span className="text-amber-300 font-bold text-[9px]">
                {diamondBalance.toLocaleString()}
              </span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 h-5 w-5 p-0">
                  <Settings className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-slate-900/95 border-purple-500/30">
                <DropdownMenuItem onClick={() => setIsSoundEnabled(!isSoundEnabled)} className="text-white/80 hover:text-white text-xs gap-2">
                  {isSoundEnabled ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
                  {isSoundEnabled ? 'Mute Sound' : 'Unmute Sound'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowRulesPanel(true)} className="text-white/80 hover:text-white text-xs gap-2">
                  <HelpCircle className="w-3 h-3" />
                  Game Rules
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowHistoryPanel(true)} className="text-white/80 hover:text-white text-xs gap-2">
                  <History className="w-3 h-3" />
                  Bet History
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={() => setShowLeaderboardPanel(true)} className="text-white/80 hover:text-white text-xs gap-2">
                  <Trophy className="w-3 h-3 text-amber-400" />
                  Leaderboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" onClick={() => setShowGameSelector(!showGameSelector)} className="text-white/70 hover:text-white hover:bg-white/10 h-5 w-5 p-0">
              <ChevronDown className={cn("w-3 h-3 transition-transform", showGameSelector && "rotate-180")} />
            </Button>
          </div>
        </div>
      )}

      {/* Phase Banner - REMOVED duplicate timer as per user request */}
      {/* Timer is already shown in header - no need for second timer */}

      {/* Compact Game Selector - HIDDEN for external games */}
      {!isCurrentGameExternal && (
      <AnimatePresence>
        {showGameSelector && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-b border-white/10 overflow-hidden bg-black/20"
          >
            {/* Category Tabs */}
            <div className="p-2 border-b border-white/5">
              <GameCategoryTabs
                categories={categories}
                activeCategory={activeCategory}
                onCategoryChange={setActiveCategory}
              />
            </div>

            {/* Games Grid */}
            <div className="p-2 max-h-48 overflow-y-auto scrollbar-hide">
              <div className="grid grid-cols-4 gap-1.5">
                {filteredGames.map((game) => (
                  <motion.button
                    key={game.game_id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleGameChange(game.game_id)}
                    className={cn(
                      "p-2 rounded-xl transition-all flex flex-col items-center gap-1 relative overflow-hidden",
                      activeGame === game.game_id
                        ? "ring-2 ring-white/50 shadow-lg bg-white/15"
                        : "bg-white/5 hover:bg-white/10 border border-white/10"
                    )}
                  >
                    {/* External Badge */}
                    {game.game_type === 'external' && (
                      <span className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-green-500/80 text-[6px] font-bold rounded-full text-white">
                        FREE
                      </span>
                    )}
                    
                    {/* Show logo from Admin Panel BIG or fallback to emoji */}
                    {game.logo_url ? (
                      <img 
                        src={getProxiedUrl(game.logo_url)} 
                        alt={game.game_name}
                        className="w-14 h-14 object-cover rounded-xl"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                          const parent = (e.target as HTMLImageElement).parentElement;
                          if (parent) {
                            const fallback = parent.querySelector('.emoji-fallback');
                            if (fallback) (fallback as HTMLElement).style.display = 'block';
                          }
                        }}
                      />
                    ) : null}
                    <span className={cn("text-2xl emoji-fallback", game.logo_url && "hidden")}>{game.game_emoji}</span>
                    <span className="text-white text-[8px] font-medium text-center leading-tight line-clamp-1">
                      {game.game_name}
                    </span>
                    
                    {game.max_multiplier && game.game_type !== 'external' && (
                      <span className="text-[7px] text-amber-400 font-bold">
                        {game.max_multiplier}x
                      </span>
                    )}
                  </motion.button>
                ))}
              </div>

              {filteredGames.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-white/40">
                  <Gamepad2 className="w-8 h-8 mb-2" />
                  <p className="text-xs">No games in this category</p>
                </div>
              )}
            </div>

            {/* Quick Stats */}
            <div className="px-2 py-1.5 bg-black/30 border-t border-white/5 flex items-center justify-between text-[9px] text-white/50">
              <span className="flex items-center gap-1">
                <Gamepad2 className="w-3 h-3" />
                {filteredGames.length} Games
              </span>
              <span className="flex items-center gap-1">
                {filteredGames.filter(g => g.game_type === 'external').length} Free HTML5 Games
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* Top Compact Premium Bet Controls - HIDDEN for external games */}
      {!isCurrentGameExternal && phase === 'betting' && activeGame !== 'roulette' && (
        <div className="px-2 py-1.5 bg-gradient-to-r from-purple-900/40 via-black/40 to-pink-900/40 border-b border-white/10">
          <div className="flex items-center justify-between gap-2">
            {/* Preset Bet Chips - Left side */}
            <div className="flex items-center gap-1">
              {presetBets.map((amount) => (
                <motion.button
                  key={amount}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setBetAmount(amount)}
                  disabled={amount > userCoins}
                  className={cn(
                    "px-2 py-1 rounded-full text-[9px] font-bold transition-all",
                    betAmount === amount
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 ring-1 ring-white/30"
                      : amount > userCoins
                        ? "bg-white/5 text-white/30"
                        : "bg-white/10 text-white/80 hover:bg-white/20"
                  )}
                >
                  {formatBetAmount(amount)}
                </motion.button>
              ))}
            </div>
            
            {/* Current Bet Display - Right side */}
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-amber-500/30 to-yellow-500/30 rounded-full border border-amber-500/40 shadow-lg shadow-amber-500/10">
              <Coins className="w-3 h-3 text-amber-400" />
              <span className="text-amber-300 font-bold text-xs">{betAmount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Game Area - More Compact */}
      <div className="p-1.5">
        {renderGameComponent()}
      </div>

      {/* Live Betters - HIDDEN for external games */}
      {!isCurrentGameExternal && bets.length > 0 && (
        <div className="px-1.5 py-0.5 bg-black/30 border-t border-white/10">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            <span className="text-white/40 text-[8px] whitespace-nowrap">Live:</span>
            {bets.slice(0, 6).map((bet) => (
              <motion.div
                key={bet.id}
                initial={{ scale: 0, x: 10 }}
                animate={{ scale: 1, x: 0 }}
                className="flex items-center gap-0.5 px-1 py-0.5 bg-white/10 rounded-full shrink-0"
              >
                <Avatar className="w-3 h-3">
                  <AvatarImage src={bet.profiles?.avatar_url} />
                  <AvatarFallback className="text-[5px] bg-purple-600">
                    {bet.profiles?.username?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="text-white text-[8px] font-medium">
                  {formatBetAmount(bet.bet_amount)}
                </span>
                {bet.is_processed && (
                  bet.is_winner ? (
                    <Trophy className="w-2 h-2 text-yellow-400" />
                  ) : (
                    <X className="w-2 h-2 text-red-400" />
                  )
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
      {!isCurrentGameExternal && (
      <AnimatePresence>
        {phase === 'result' && myBets.length > 0 && (
          <motion.div
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 10, opacity: 0 }}
            className="mx-1.5 mb-1.5 space-y-0.5"
          >
            {myBets.map((bet) => (
              <div
                key={bet.id}
                className={cn(
                  "p-1.5 rounded-md flex items-center justify-between",
                  bet.is_winner
                    ? "bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30"
                    : "bg-gradient-to-r from-red-500/20 to-rose-500/20 border border-red-500/30"
                )}
              >
                <div className="flex items-center gap-1">
                  {bet.is_winner ? (
                    <>
                      <Trophy className="w-3 h-3 text-yellow-400" />
                      <span className="text-green-400 font-bold text-[10px]">Won!</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-3 h-3 text-red-400 rotate-180" />
                      <span className="text-red-400 font-bold text-[10px]">Lost</span>
                    </>
                  )}
                </div>
                <div className="text-right">
                  {bet.is_winner ? (
                    <div className="flex items-center gap-0.5 text-green-400 font-bold text-[10px]">
                      <span>+{bet.win_amount.toLocaleString()}</span>
                      <Coins className="w-2.5 h-2.5" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 text-red-400 font-bold text-[10px]">
                      <span>-{bet.bet_amount.toLocaleString()}</span>
                      <Coins className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      )}

      {/* Game Panels */}
      <GameRulesPanel
        isOpen={showRulesPanel}
        onClose={() => setShowRulesPanel(false)}
        gameId={activeGame || ''}
        gameName={currentGame?.game_name || 'Game'}
      />
      
      <BetHistoryPanel
        isOpen={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
        gameId={activeGame || undefined}
      />
      
      <GameLeaderboardPanel
        isOpen={showLeaderboardPanel}
        onClose={() => setShowLeaderboardPanel(false)}
        gameId={activeGame || undefined}
      />
    </div>
  );
}

export default LiveGameBoard;
