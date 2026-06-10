import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Volume2, VolumeX, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";
import { toast } from "sonner";
import { useGameSound } from "@/hooks/useGameSound";
import { useUserBalance, updateCachedBalance } from "@/hooks/useUserBalance";
import { Coins } from "lucide-react";
import { RouletteWheel } from "./RouletteWheel";
import { BettingGrid } from "./BettingGrid";
import { ChipSelector } from "./ChipSelector";
import { RouletteHistory } from "./RouletteHistory";
import { cn } from "@/lib/utils";

interface Bet {
  type: string;
  amount: number;
  multiplier: number;
}

interface RouletteBet {
  id: string;
  user_id: string;
  bet_type: string;
  bet_amount: number;
  multiplier: number;
  profiles?: {
    display_name: string;
    avatar_url: string;
  };
}

interface RouletteSession {
  id: string;
  session_number: number;
  status: string;
  winning_number: number | null;
  betting_ends_at: string | null;
}

const BETTING_DURATION = 25;

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

export const RouletteGame = ({ embedded = false, onWin }: { embedded?: boolean; onWin?: (amount: number) => void }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const { balance: diamondBalance, refetch: refetchBalance } = useUserBalance();
  const [currentSession, setCurrentSession] = useState<RouletteSession | null>(null);
  const [allBets, setAllBets] = useState<RouletteBet[]>([]);
  const [myBets, setMyBets] = useState<Bet[]>([]);
  const [selectedChip, setSelectedChip] = useState(1000);
  const [timeLeft, setTimeLeft] = useState(BETTING_DURATION);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [recentResults, setRecentResults] = useState<number[]>([]);
  const [gamePhase, setGamePhase] = useState<'betting' | 'countdown' | 'spinning' | 'result'>('betting');

  // ✅ CRITICAL: Use refs to prevent stale closures and duplicate calls
  const sessionRef = useRef<string | null>(null);
  const myBetsRef = useRef<Bet[]>([]);
  const spinCalledRef = useRef(false);
  const completeCalledRef = useRef(false);

  const { playSpinSound, playWinSound, playLoseSound, playBetSound, setMuted } = useGameSound();

  // Keep myBetsRef in sync
  useEffect(() => {
    myBetsRef.current = myBets;
  }, [myBets]);

  useEffect(() => {
    setMuted(!soundEnabled);
  }, [soundEnabled, setMuted]);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    fetchUser();
  }, []);

  const totalBet = allBets.reduce((sum, bet) => sum + bet.bet_amount, 0);
  const myTotalBet = myBets.reduce((sum, bet) => sum + bet.amount, 0);

  // Fetch or create current session
  const fetchCurrentSession = useCallback(async () => {
    try {
      const { data: result, error } = await supabase.rpc('roulette_get_or_create_session', {
        p_duration_seconds: BETTING_DURATION
      });

      if (error || !result) {
        console.error('[Roulette] Session RPC error:', error);
        return;
      }

      const sessionData = result as any;
      if (!sessionData.success) return;

      const session: RouletteSession = {
        id: sessionData.session_id,
        session_number: 0,
        status: sessionData.status,
        winning_number: sessionData.winning_number,
        betting_ends_at: sessionData.betting_ends_at,
      };

      setCurrentSession(session);
      sessionRef.current = session.id;
      // ✅ Reset spin guards for new session
      spinCalledRef.current = false;
      completeCalledRef.current = false;

      if (session.status === 'spinning') {
        setGamePhase('spinning');
        setIsSpinning(true);
        // If session is already spinning, also schedule completion
        if (!completeCalledRef.current) {
          completeCalledRef.current = true;
          setTimeout(async () => {
            await supabase.rpc('roulette_complete_session', { p_session_id: session.id });
          }, 5000);
        }
      } else if (session.status === 'betting') {
        setGamePhase('betting');
        setIsSpinning(false);
        setWinningNumber(null);
        const endTime = new Date(session.betting_ends_at!).getTime();
        const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
        setTimeLeft(remaining);
      }

      if (sessionData.created) {
        setAllBets([]);
        setMyBets([]);
      } else {
        const { data: bets } = await supabase
          .from("roulette_bets")
          .select(`*, profiles:user_id (display_name, avatar_url)`)
          .eq("session_id", session.id);
        if (bets) setAllBets(bets);
      }
    } catch (err) {
      console.error('[Roulette] fetchCurrentSession error:', err);
    }
  }, []);

  const fetchRecentResults = useCallback(async () => {
    const { data } = await supabase
      .from("roulette_sessions")
      .select("winning_number")
      .eq("status", "completed")
      .not("winning_number", "is", null)
      .order("completed_at", { ascending: false })
      .limit(20);
    if (data) setRecentResults(data.map(s => s.winning_number as number));
  }, []);

  useEffect(() => {
    fetchCurrentSession();
    fetchRecentResults();
  }, [fetchCurrentSession, fetchRecentResults]);

  // Timer countdown
  useEffect(() => {
    if (!currentSession?.betting_ends_at || (gamePhase !== 'betting' && gamePhase !== 'countdown')) return;

    const updateTimer = () => {
      const endTime = new Date(currentSession.betting_ends_at!).getTime();
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 3 && remaining > 0) {
        setGamePhase('countdown');
      }

      // ✅ FIX: Only call spinWheel ONCE using ref guard
      if (remaining === 0 && !spinCalledRef.current) {
        spinCalledRef.current = true;
        spinWheel();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 200);
    return () => clearInterval(interval);
  }, [currentSession?.betting_ends_at, gamePhase]);

  // Pkg91: roulette_bets/roulette_sessions are NOT in supabase_realtime publication
  // (was a silent dead channel). Use app_sync trigger fan-out (server triggers
  // tg_app_sync_roulette_bets + tg_app_sync_roulette_sessions emit per-participant
  // app_sync rows that travel over the single notifications WS).
  useAppSyncEvent(
    ['roulette_bets', 'roulette_sessions'],
    async (detail) => {
      const sessionId = currentSession?.id;
      if (!sessionId) return;
      const payload = (detail.payload || {}) as any;
      if (payload.session_id && payload.session_id !== sessionId) return;
      if (detail.topic === 'roulette_sessions' && detail.rowId && detail.rowId !== sessionId) return;

      if (detail.topic === 'roulette_bets') {
        if (!detail.rowId) return;
        const { data: betWithProfile } = await supabase
          .from('roulette_bets')
          .select(`*, profiles:user_id (display_name, avatar_url)`)
          .eq('id', detail.rowId)
          .maybeSingle();
        if (betWithProfile) {
          setAllBets(prev => {
            if (prev.some(b => b.id === (betWithProfile as any).id)) return prev;
            return [...prev, betWithProfile as any];
          });
        }
        return;
      }

      if (detail.topic === 'roulette_sessions') {
        const status = payload.status;
        const winningNumber = payload.winning_number;
        if (status === 'spinning' && winningNumber !== null && winningNumber !== undefined) {
          setIsSpinning(true);
          setGamePhase('spinning');
          setWinningNumber(null);
        }
        if (status === 'completed' && winningNumber !== null && winningNumber !== undefined) {
          const winNum = winningNumber as number;
          setIsSpinning(false);
          setWinningNumber(winNum);
          setGamePhase('result');
          setTimeout(() => { processSettlement(winNum); }, 2000);
          setTimeout(() => {
            setWinningNumber(null);
            setIsSpinning(false);
            setMyBets([]);
            myBetsRef.current = [];
            setAllBets([]);
            setGamePhase('betting');
            spinCalledRef.current = false;
            completeCalledRef.current = false;
            fetchCurrentSession();
            fetchRecentResults();
          }, 7000);
        }
      }
    },
    !!currentSession?.id,
  );


  // Server-authoritative spin: server generates winning number AND credits winners.
  // Idempotent — only the first call per round actually settles; others receive the cached result.
  const spinWheel = async () => {
    if (!currentSession) return;

    console.log('[Roulette] 🎰 Spinning wheel for session:', currentSession.id);
    setIsSpinning(true);
    setGamePhase('spinning');
    playSpinSound();

    try {
      await supabase.rpc('roulette_spin_and_settle', {
        p_session_id: currentSession.id,
      });
      // Result will arrive via realtime app_sync 'roulette_sessions' broadcast
      // (status='completed' + winning_number). processSettlement() then reads
      // the player's authoritative win_amount from roulette_bets.
    } catch (err) {
      console.error('[Roulette] Spin error:', err);
      spinCalledRef.current = false;
      fetchCurrentSession();
    }
  };

  // Read the authoritative settlement result from the server.
  // The server has already credited the player's wallet inside roulette_spin_and_settle.
  const processSettlement = async (winNum: number) => {
    if (!userId || !currentSession) return;

    try {
      const { data: myBetRows } = await supabase
        .from('roulette_bets')
        .select('bet_amount, win_amount, is_winner')
        .eq('session_id', currentSession.id)
        .eq('user_id', userId);

      const rows = myBetRows ?? [];
      if (rows.length === 0) {
        // Player didn't bet this round — nothing to show.
        return;
      }

      const totalWin = rows.reduce((s, r: any) => s + (r.win_amount || 0), 0);
      const anyWinner = rows.some((r: any) => r.is_winner);

      if (anyWinner && totalWin > 0) {
        playWinSound();
        toast.success(`🎉 You Won ${totalWin.toLocaleString()} Diamonds!`, { duration: 5000 });
        onWin?.(totalWin);
      } else {
        playLoseSound();
        toast.error("Better luck next time!");
      }
      // Server credited the coins; just refresh the local balance display.
      refetchBalance();
    } catch (e) {
      console.error('[Roulette] Settlement read error:', e);
      refetchBalance();
    }
  };

  // Atomic bet: a single RPC validates the round phase, validates the bet type
  // against the official multiplier whitelist, deducts My Diamonds, and inserts
  // the bet row — all in one transaction. The client never decides payout.
  const placeBet = async (betType: string, multiplier: number) => {
    if (!userId || !currentSession) {
      toast.error("Please login to place bets");
      return;
    }

    if (gamePhase !== 'betting') {
      toast.error("Betting is closed!");
      return;
    }

    const { data, error } = await supabase.rpc('roulette_place_bet', {
      p_session_id: currentSession.id,
      p_bet_type: betType,
      p_amount: selectedChip,
    });

    if (error) {
      toast.error("Failed to place bet");
      console.error('[Roulette] place_bet error:', error);
      return;
    }

    const result = (data ?? {}) as any;
    if (!result.success) {
      const serverBal = typeof result.balance === 'number' ? result.balance : undefined;
      if (serverBal !== undefined) updateCachedBalance(serverBal);
      const msg = result.error === 'Insufficient diamonds' && serverBal !== undefined
        ? `Not enough diamonds (you have ${serverBal.toLocaleString()})`
        : (result.error || "Failed to place bet");
      toast.error(msg);
      refetchBalance();
      return;
    }

    if (result.new_balance !== undefined) updateCachedBalance(result.new_balance);
    refetchBalance();

    // Track the bet locally just for UI chip display; the server is the source of truth for payout.
    const serverMultiplier = typeof result.multiplier === 'number' ? result.multiplier : multiplier;
    setMyBets(prev => [...prev, { type: betType, amount: selectedChip, multiplier: serverMultiplier }]);

    playBetSound();
  };

  const getNumberColor = (num: number): "red" | "black" | "green" => {
    if (num === 0) return "green";
    return RED_NUMBERS.includes(num) ? "red" : "black";
  };

  const isBettingOpen = gamePhase === 'betting' && timeLeft > 3;

  return (
    <div className={cn(
      "relative overflow-hidden flex flex-col",
      embedded ? "w-full h-full" : "min-h-screen"
    )}
      style={{
        background: "radial-gradient(ellipse at center, #2d6b30 0%, #1a4f1c 40%, #0f3311 80%, #0a2209 100%)"
      }}
    >
      {/* Felt texture overlay */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 3h1v1H1V3zm2-2h1v1H3V1z' fill='%23000' fill-opacity='0.15'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header - standalone mode only */}
      {!embedded && (
        <div className="relative z-10 flex items-center justify-between p-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory(!showHistory)} className="w-10 h-10 rounded-full bg-yellow-600/30 border-2 border-yellow-500/60 flex items-center justify-center backdrop-blur-sm">
              <History className="w-5 h-5 text-yellow-400" />
            </button>
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="w-10 h-10 rounded-full bg-yellow-600/30 border-2 border-yellow-500/60 flex items-center justify-center backdrop-blur-sm">
              {soundEnabled ? <Volume2 className="w-5 h-5 text-yellow-400" /> : <VolumeX className="w-5 h-5 text-yellow-400" />}
            </button>
          </div>
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-4 py-2 rounded-full border border-yellow-600/30">
            <Coins className="w-5 h-5 text-amber-400" />
            <span className="text-white font-bold">{diamondBalance.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Embedded mode: compact diamond balance */}
      {embedded && (
        <div className="relative z-10 flex items-center justify-between px-3 pt-2">
          <div className="flex items-center gap-1 bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full">
            <Coins className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-white font-bold text-xs">{diamondBalance.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setSoundEnabled(!soundEnabled)} className="w-7 h-7 rounded-full bg-yellow-600/30 flex items-center justify-center">
              {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-yellow-400" /> : <VolumeX className="w-3.5 h-3.5 text-yellow-400" />}
            </button>
          </div>
        </div>
      )}

      {/* Timer Bar */}
      <div className={cn("relative z-10 px-3", embedded ? "pt-1" : "")}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1 mr-2">
            <span className="text-yellow-400 text-[10px] whitespace-nowrap font-semibold">Latest</span>
            {recentResults.slice(0, 8).map((num, i) => (
              <div key={i} className={cn(
                "rounded-full flex items-center justify-center text-white font-bold shrink-0",
                embedded ? "w-5 h-5 text-[8px]" : "w-6 h-6 text-[10px]",
                getNumberColor(num) === "red" && "bg-red-600",
                getNumberColor(num) === "black" && "bg-gray-900 border border-gray-600",
                getNumberColor(num) === "green" && "bg-green-600"
              )}>
                {num}
              </div>
            ))}
          </div>
          <div className={cn(
            "px-3 py-1.5 rounded-lg font-bold text-white text-sm min-w-[60px] text-center shadow-lg shrink-0",
            gamePhase === 'spinning' && "bg-purple-600",
            gamePhase === 'result' && "bg-green-600",
            gamePhase === 'countdown' && "bg-red-600 animate-pulse",
            gamePhase === 'betting' && timeLeft <= 5 && "bg-red-600 animate-pulse",
            gamePhase === 'betting' && timeLeft > 5 && "bg-blue-600"
          )}>
            {gamePhase === 'spinning' ? '🎡' : gamePhase === 'result' ? '✅' : `${timeLeft}s`}
          </div>
        </div>

        {gamePhase === 'betting' && (
          <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-1">
            <motion.div
              className={cn("h-full rounded-full", timeLeft <= 5 ? "bg-red-500" : "bg-green-500")}
              animate={{ width: `${(timeLeft / BETTING_DURATION) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
      </div>

      {/* Bet Info */}
      <div className={cn("relative z-10 flex items-center justify-between px-3 mb-1", embedded && "text-[10px]")}>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-[10px]">Pool: <span className="text-yellow-400 font-semibold">{totalBet.toLocaleString()}</span></span>
          <span className="text-white/60 text-[10px]">My: <span className="text-cyan-400 font-semibold">{myTotalBet.toLocaleString()}</span></span>
        </div>
        <span className={cn(
          "text-[10px] font-semibold px-2 py-0.5 rounded-full",
          isBettingOpen ? "text-green-400 bg-green-500/20" : "text-red-400 bg-red-500/20"
        )}>
          {isBettingOpen ? "PLACE BETS" : gamePhase === 'spinning' ? "SPINNING..." : gamePhase === 'result' ? "RESULT" : "CLOSING..."}
        </span>
      </div>

      {/* Roulette Wheel */}
      <div className={cn("flex justify-center relative z-10 shrink-0", embedded ? "mb-0" : "mb-1")}>
        <div className={embedded ? "w-28 h-28" : ""}>
          <RouletteWheel isSpinning={isSpinning} winningNumber={winningNumber} />
        </div>
      </div>

      {/* Gold Bar Separator */}
      <div className="relative z-10">
        <div className="h-1 mx-4 rounded-full" style={{
          background: "linear-gradient(to right, #6B4E10, #DAA520, #FFD700, #DAA520, #6B4E10)"
        }} />
      </div>

      {/* Betting Area */}
      <div className={cn("relative z-10 flex-1 overflow-auto", embedded ? "p-2 pt-1" : "p-4 pt-2")}>
        <BettingGrid myBets={myBets} allBets={allBets} onPlaceBet={placeBet} disabled={!isBettingOpen} />
        <ChipSelector selectedChip={selectedChip} onSelectChip={setSelectedChip} balance={diamondBalance} />
      </div>

      {/* 3-2-1 Countdown Overlay */}
      <AnimatePresence>
        {gamePhase === 'countdown' && timeLeft > 0 && timeLeft <= 3 && (
          <motion.div
            key={`countdown-${timeLeft}`}
            initial={{ scale: 3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none"
          >
            <div className="text-8xl font-black text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,0.8)]">
              {timeLeft}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Panel */}
      <AnimatePresence>
        {showHistory && <RouletteHistory results={recentResults} onClose={() => setShowHistory(false)} />}
      </AnimatePresence>

      {/* Winning Number Overlay */}
      <AnimatePresence>
        {gamePhase === 'result' && winningNumber !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", damping: 15 }}
              className={cn(
                "w-28 h-28 rounded-full flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4",
                getNumberColor(winningNumber) === "red" && "bg-gradient-to-br from-red-500 to-red-700 border-red-400",
                getNumberColor(winningNumber) === "black" && "bg-gradient-to-br from-gray-700 to-gray-900 border-gray-500",
                getNumberColor(winningNumber) === "green" && "bg-gradient-to-br from-green-500 to-green-700 border-green-400"
              )}
            >
              {winningNumber}
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-white text-lg font-bold mt-4"
            >
              Winning Number: {winningNumber}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
