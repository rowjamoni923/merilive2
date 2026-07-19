import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMobileOrientation } from "@/hooks/useMobileOrientation";

import { useUserBalance, updateCachedBalance } from "@/hooks/useUserBalance";
import { useGameToken } from "@/hooks/useGameToken";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getProxiedUrl } from "@/utils/r2ProxyUrl";
import { getOptimizedImageUrl } from "@/utils/imageOptimize";
import { 
  Gem, 
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
import { getRequiredDisplayLevel } from "@/utils/stableLevel";
// LiveGame3DStage removed — 3D visuals now live INSIDE each game (wheel/board) per spec
import { LiveFerrisWheelGame } from "./live-games/LiveFerrisWheelGame";
import { LiveTeenPattiGame } from "./live-games/LiveTeenPattiGame";
import { LiveLuckyNumberGame } from "./live-games/LiveLuckyNumberGame";
import { LiveRocketRaceGame } from "./live-games/LiveRocketRaceGame";
import { LiveRouletteGame } from "./live-games/LiveRouletteGame";
import { GameErrorBoundary } from "./GameErrorBoundary";
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
  /** Where the win bubble should appear: live stream chat, party room chat, or nowhere */
  context?: 'live' | 'party' | 'none';
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

export function LiveGameBoard({ selectedGame, roomId, onClose, onOpenGifts, context = 'party' }: LiveGameBoardProps) {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [activeGame, setActiveGame] = useState<string | null>(selectedGame || 'crash');
  const [loading, setLoading] = useState(true);
  const { isLandscape, isVerySmallHeight } = useMobileOrientation();
  const { balance: diamondBalance, refetch: refetchBalance } = useUserBalance();

  const { buildGameUrl, loading: tokenLoading } = useGameToken();
  const [externalGameUrl, setExternalGameUrl] = useState<string | null>(null);
  const [userDiamonds, setUserDiamonds] = useState(0);
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
    fetchUserDiamonds();

    // Pkg83: Removed duplicate static-named 'game-diamond-balance' channel
    // (G3 violation + duplicated useUserBalance own-row subscription).
    // Listen to global 'own-beans-updated' window event (Pkg85) instead, and
    // refresh via REST on visibility change as safety net.
    const onOwnUpdate = () => { void fetchUserDiamonds(); };
    window.addEventListener('own-beans-updated', onOwnUpdate);
    // No-auto-refresh: own-beans-updated push is sole trigger.
    return () => {
      window.removeEventListener('own-beans-updated', onOwnUpdate);
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

  const fetchUserDiamonds = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUserId(user.id);
      const { data } = await supabase
        .from('profiles') // guard-ok: own-row read (id=eq.user.id), not cross-user
        .select('diamonds, username, user_level, host_level, max_user_level, gender, is_host')
        .eq('id', user.id)
        .single();

      if (data) {
        setUserDiamonds(data.diamonds);
        setCurrentUserProfile({
          username: data.username || 'Player',
          level: getRequiredDisplayLevel(data)
        });
      }
    }
  };

  // Step 2 perf: stabilize callbacks via refs so the 5 live-game children
  // don't re-render every time userDiamonds/balance ticks or roomId rebinds.
  const profileRef = useRef(currentUserProfile);
  const userIdRef = useRef(currentUserId);
  const roomIdRef = useRef(roomId);
  const contextRef = useRef(context);
  const userDiamondsRef = useRef(userDiamonds);
  const phaseRef = useRef(phase);
  useEffect(() => { profileRef.current = currentUserProfile; }, [currentUserProfile]);
  useEffect(() => { userIdRef.current = currentUserId; }, [currentUserId]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { contextRef.current = context; }, [context]);
  useEffect(() => { userDiamondsRef.current = userDiamonds; }, [userDiamonds]);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Game win notification handler - includes user name and level
  const handleGameWin = useCallback(async (winAmount: number, gameName: string, gameEmoji: string) => {
    const rId = roomIdRef.current;
    const uId = userIdRef.current;
    if (rId && uId && winAmount > 0) {
      await sendGameWinNotification({
        roomId: rId,
        userId: uId,
        gameName,
        winAmount,
        gameEmoji,
        userName: profileRef.current?.username,
        userLevel: profileRef.current?.level,
        context: contextRef.current,
      });
    }
  }, []);

  const handleUpdateDiamonds = useCallback((newBalance: number) => {
    setUserDiamonds(newBalance);
  }, []);

  const handlePlaceBet = useCallback(async (betType?: string, betValue?: string) => {
    if (phaseRef.current !== 'betting') {
      toast.error('Betting is closed');
      return null;
    }

    const currentBalance = userDiamondsRef.current;
    if (betAmount > currentBalance) {
      toast.error('Insufficient diamonds');
      return null;
    }

    // Immediately deduct from local state for instant feedback
    const previousDiamonds = currentBalance;
    setUserDiamonds((prev) => prev - betAmount);

    const result = await placeBet(betAmount, betType, betValue);

    if (result.success) {
      if (result.new_balance !== undefined) {
        setUserDiamonds(result.new_balance);
      }
      return result;
    } else {
      setUserDiamonds(previousDiamonds);
      toast.error(result.error || 'Failed to place bet');
      return result;
    }
  }, [betAmount, placeBet]);


  const currentGame = games.find(g => g.game_id === activeGame);
  const presetBets = currentGame?.preset_bets || DEFAULT_PRESET_BETS;

  const renderGameComponent = () => {
    if (!activeGame || !currentGame) return null;

    // Games with built-in React components should ALWAYS use them (not external iframe)
    // This ensures they connect to the app's diamond system
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
      userDiamonds,
      phase,
      timeLeft,
      currentRound,
      bets,
      myBets,
      onPlaceBet: handlePlaceBet,
      onProcessResult: processResult,
      onUpdateDiamonds: handleUpdateDiamonds,
      onGameWin: (winAmount: number) => handleGameWin(winAmount, currentGame.game_name, currentGame.game_emoji || "🎰")
    };

    // Wrap each per-game render in GameErrorBoundary so a crash in (say) the
    // Ferris Wheel doesn't blank the whole game board — user can retry just
    // that game or pick another from the tabs above.
    let inner: React.ReactNode = null;
    switch (activeGame) {
      case 'roulette':
        inner = <LiveRouletteGame {...gameProps} onTimerUpdate={handleTimerUpdate} />;
        break;
      case 'ferris-wheel':
      case 'ferris_wheel':
        inner = <LiveFerrisWheelGame {...gameProps} onTimerUpdate={handleTimerUpdate} />;
        break;
      case 'teen-patti':
      case 'teen_patti':
        inner = <LiveTeenPattiGame {...gameProps} onTimerUpdate={handleTimerUpdate} />;
        break;
      case 'lucky_number':
        inner = <LiveLuckyNumberGame {...gameProps} onTimerUpdate={handleTimerUpdate} />;
        break;
      case 'rocket_race':
        inner = <LiveRocketRaceGame {...gameProps} onTimerUpdate={handleTimerUpdate} />;
        break;
    }

    if (inner) {
      return (
        <GameErrorBoundary
          key={activeGame ?? 'game'}
          gameName={currentGame.game_name}
          onReset={() => setActiveGame((g) => g)}
        >
          {inner}
        </GameErrorBoundary>
      );
    }
    switch (activeGame) {
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
              🎮 LiveKit
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
    <div className="live-game-shell w-full rounded-[28px] overflow-hidden relative z-20 pointer-events-auto bg-gradient-to-b from-[#141526] to-[#0A0A12] border border-[#D4AF37]/30 shadow-2xl shadow-black/80">
      {/* Obsidian Gold Premium Header */}
      {!isCurrentGameExternal && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-2 min-w-0">
            {currentGame && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-7 h-7 rounded-lg flex items-center justify-center shadow-lg overflow-hidden relative bg-gradient-to-tr from-[#D4AF37] to-[#F9E498] shrink-0"
              >
                {currentGame.logo_url ? (
                  <img loading="eager" decoding="async"
                    src={getOptimizedImageUrl(getProxiedUrl(currentGame.logo_url), { width: 56, quality: 80 })}
                    alt={currentGame.game_name}
                    className="w-full h-full object-contain rounded-lg"
                   
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      if (target.nextElementSibling) {
                        (target.nextElementSibling as HTMLElement).style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div
                  className="emoji-fallback absolute inset-0 items-center justify-center text-sm text-[#0A0A12] font-black"
                  style={{ display: currentGame.logo_url ? 'none' : 'flex' }}
                >
                  {currentGame.game_emoji}
                </div>
              </motion.div>
            )}
            <div className="flex flex-col min-w-0">
              <span
                className="text-[11px] font-bold text-white/90 tracking-wide uppercase leading-tight truncate"
                style={{ fontFamily: "'Cinzel', serif" }}
              >
                {currentGame?.game_name || 'Game'}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[9px] text-white/40 font-medium">R#{currentRound?.round_number || 0}</span>
                <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-white/10 rounded-full">
                  <Users className="w-2 h-2 text-white/60" />
                  <span className="text-[9px] text-white/60">{currentRound?.total_players || 0}</span>
                </div>
                {currentRound && currentRound.total_bet_amount > 0 && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-full">
                    <Gem className="w-2 h-2 text-[#D4AF37]" />
                    <span className="text-[9px] text-[#D4AF37] font-bold">{currentRound.total_bet_amount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex items-center gap-1 bg-black/40 border border-[#D4AF37]/20 rounded-full pl-1.5 pr-2 py-1">
              <Diamond3DIcon size={11} />
              <span className="text-white text-[10px] font-bold">{diamondBalance.toLocaleString()}</span>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-white/40 hover:text-white hover:bg-white/10 h-6 w-6 p-0">
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40 bg-[#0A0A12] border-[#D4AF37]/30">
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
                  <Trophy className="w-3 h-3 text-[#D4AF37]" />
                  Leaderboard
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="sm" onClick={() => setShowGameSelector(!showGameSelector)} className="text-white/40 hover:text-white hover:bg-white/10 h-6 w-6 p-0">
              <ChevronDown className={cn("w-4 h-4 transition-transform", showGameSelector && "rotate-180")} />
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
                      <img loading="eager" decoding="async" 
                        src={getOptimizedImageUrl(getProxiedUrl(game.logo_url), { width: 112, quality: 78 })} 
                        alt={game.game_name}
                        className="w-14 h-14 object-contain rounded-xl"
                       
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

      {/* Obsidian Gold Bet Chips Bar */}
      {!isCurrentGameExternal && phase === 'betting' && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-gradient-to-r from-[#1A1B2E] to-[#12121D] border-b border-white/5">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {presetBets.map((amount) => {
              const isActive = betAmount === amount;
              const tooHigh = amount > userDiamonds;
              return (
                <motion.button
                  key={amount}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setBetAmount(amount)}
                  disabled={tooHigh}
                  className={cn(
                    "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-[10px] font-black tabular-nums transition-all",
                    isActive
                      ? "border-2 border-[#D4AF37] bg-gradient-to-b from-[#F9E498] to-[#D4AF37] text-[#1A1B2E] shadow-[0_0_12px_rgba(212,175,55,0.45)] ring-2 ring-black/30"
                      : tooHigh
                        ? "border border-white/5 bg-white/[0.02] text-white/25 cursor-not-allowed"
                        : "border border-white/10 bg-white/5 text-white/70 hover:border-[#D4AF37]/50 hover:text-white"
                  )}
                >
                  {formatBetAmount(amount)}
                </motion.button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#D4AF37]/10 border border-[#D4AF37]/40 rounded-xl shrink-0">
            <Gem className="w-3 h-3 text-[#D4AF37]" />
            <span className="text-[#D4AF37] font-black text-xs tabular-nums">{betAmount.toLocaleString()}</span>
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
                      <Gem className="w-2.5 h-2.5" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5 text-red-400 font-bold text-[10px]">
                      <span>-{bet.bet_amount.toLocaleString()}</span>
                      <Gem className="w-2.5 h-2.5" />
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
