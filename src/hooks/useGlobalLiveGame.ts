import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GlobalGameRound {
  id: string;
  game_id: string;
  room_id: string | null;
  round_number: number;
  status: 'betting' | 'playing' | 'completed';
  betting_end_at: string;
  game_start_at: string | null;
  game_end_at: string | null;
  result: any;
  total_bets: number;
  total_bet_amount: number;
  total_players: number;
  winning_value: string | null;
  created_at: string;
}

interface GlobalGameBet {
  id: string;
  round_id: string;
  user_id: string;
  bet_amount: number;
  bet_type: string | null;
  bet_value: string | null;
  win_amount: number;
  multiplier: number;
  is_winner: boolean;
  is_processed: boolean;
  profiles?: {
    username: string;
    avatar_url: string;
    display_name: string;
  };
}

interface UseGlobalLiveGameProps {
  gameId: string;
  bettingSeconds?: number;
}

export function useGlobalLiveGame({
  gameId,
  bettingSeconds = 30
}: UseGlobalLiveGameProps) {
  const { toast } = useToast();
  const [currentRound, setCurrentRound] = useState<GlobalGameRound | null>(null);
  const [recentBets, setRecentBets] = useState<GlobalGameBet[]>([]);
  const [myBets, setMyBets] = useState<GlobalGameBet[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [phase, setPhase] = useState<'betting' | 'playing' | 'result' | 'waiting'>('waiting');
  const [userBalance, setUserBalance] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [totalPool, setTotalPool] = useState(0);
  const [lastResult, setLastResult] = useState<any>(null);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoProcessRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch current user balance with real-time subscription
  const fetchUserBalance = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', user.id)
        .single();
      if (data) setUserBalance(data.coins);
      return data?.coins || 0;
    }
    return 0;
  }, []);

  // Fetch current active global round
  const fetchCurrentRound = useCallback(async () => {
    const { data, error } = await supabase
      .from('live_game_rounds')
      .select('*')
      .eq('game_id', gameId)
      .is('room_id', null)
      .in('status', ['betting', 'playing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setCurrentRound(data as GlobalGameRound);
      setTotalPlayers(data.total_players || 0);
      setTotalPool(data.total_bet_amount || 0);
      return data as GlobalGameRound;
    }
    return null;
  }, [gameId]);

  // Fetch recent bets for current round
  const fetchRecentBets = useCallback(async (roundId: string) => {
    const { data, error } = await supabase
      .from('live_game_bets')
      .select(`
        *,
        profiles:user_id (username, avatar_url, display_name)
      `)
      .eq('round_id', roundId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!error && data) {
      setRecentBets(data as GlobalGameBet[]);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setMyBets((data as GlobalGameBet[]).filter(b => b.user_id === user.id));
      }
    }
  }, []);

  // Create new global round
  const createGlobalRound = useCallback(async () => {
    const { data, error } = await supabase.rpc('create_live_game_round', {
      p_game_id: gameId,
      p_room_id: null,
      p_betting_seconds: bettingSeconds
    });

    if (!error && data) {
      await fetchCurrentRound();
      setMyBets([]);
      setLastResult(null);
    }
    return data;
  }, [gameId, bettingSeconds, fetchCurrentRound]);

  // Place a bet
  const placeBet = useCallback(async (
    betAmount: number,
    betType?: string,
    betValue?: string
  ) => {
    if (!currentRound) {
      return { success: false, error: 'No active round' };
    }

    if (phase !== 'betting') {
      return { success: false, error: 'Betting is closed' };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Please login' };
    }

    // Check real-time balance
    const currentBalance = await fetchUserBalance();
    if (betAmount > currentBalance) {
      toast({
        title: "Insufficient Balance",
        description: "Please recharge to continue playing",
        variant: "destructive"
      });
      return { success: false, error: 'Insufficient balance' };
    }

    const { data, error } = await supabase.rpc('place_live_game_bet', {
      p_round_id: currentRound.id,
      p_user_id: user.id,
      p_bet_amount: betAmount,
      p_bet_type: betType || null,
      p_bet_value: betValue || null
    });

    if (error) {
      toast({
        title: "Bet Failed",
        description: error.message,
        variant: "destructive"
      });
      return { success: false, error: error.message };
    }

    const result = data as { success: boolean; error?: string; new_balance?: number };
    
    if (result.success && result.new_balance !== undefined) {
      setUserBalance(result.new_balance);
      toast({
        title: "Bet Placed!",
        description: `${betAmount} coins on ${betValue?.toUpperCase()}`,
      });
    }

    return result;
  }, [currentRound, phase, fetchUserBalance, toast]);

  // Process round result (called by auto-runner or when timer ends)
  const processResult = useCallback(async (
    winningValue: string,
    result: any = {}
  ) => {
    if (!currentRound) return null;

    setLastResult(result);

    const { data, error } = await supabase.rpc('process_live_game_round', {
      p_round_id: currentRound.id,
      p_winning_value: winningValue,
      p_result: result
    });

    if (!error) {
      // Refetch user balance to show updated coins
      await fetchUserBalance();
      
      // Show result phase
      setPhase('result');
      
      // Wait then start new round
      setTimeout(() => {
        createGlobalRound();
      }, 5000);
    }

    return data;
  }, [currentRound, createGlobalRound, fetchUserBalance]);

  // Auto-process when betting time ends
  const autoProcessRound = useCallback(async () => {
    if (!currentRound || currentRound.status !== 'betting') return;

    // Call edge function to process (it handles the result calculation)
    try {
      const { data, error } = await supabase.functions.invoke('game-auto-runner');
      if (error) {
        console.error('Auto-runner error:', error);
      } else {
        // Refresh the round data
        await fetchCurrentRound();
        await fetchUserBalance();
      }
    } catch (e) {
      console.error('Auto process failed:', e);
    }
  }, [currentRound, fetchCurrentRound, fetchUserBalance]);

  // Timer countdown
  useEffect(() => {
    if (currentRound && currentRound.status === 'betting') {
      const endTime = new Date(currentRound.betting_end_at).getTime();
      
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
        setTimeLeft(remaining);
        
        if (remaining === 0 && phase === 'betting') {
          setPhase('playing');
          // Trigger auto-process
          autoProcessRound();
        } else if (remaining > 0) {
          setPhase('betting');
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 100);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    } else if (currentRound?.status === 'playing') {
      setPhase('playing');
    } else if (currentRound?.status === 'completed') {
      setPhase('result');
      setLastResult(currentRound.result);
    } else {
      setPhase('waiting');
    }
  }, [currentRound, autoProcessRound, phase]);

  // live_game_* tables are not in supabase_realtime publication; use bounded
  // REST refreshes and RPC responses instead of postgres_changes channels.
  useEffect(() => {
    if (!currentRound) return;
    fetchRecentBets(currentRound.id);
  }, [currentRound?.id, fetchRecentBets]);

  // Initialize and ensure game is running
  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchUserBalance();
      const round = await fetchCurrentRound();
      
      if (!round) {
        // No active round, create one
        await createGlobalRound();
      }
      
      setIsLoading(false);
    };

    init();

    // Poll for auto-process every 5 seconds (backup for edge function)
    autoProcessRef.current = setInterval(async () => {
      const round = await fetchCurrentRound();
      if (!round) {
        await createGlobalRound();
      }
    }, 5000);

    return () => {
      if (autoProcessRef.current) {
        clearInterval(autoProcessRef.current);
      }
    };
  }, [fetchCurrentRound, createGlobalRound, fetchUserBalance]);

  return {
    currentRound,
    recentBets,
    myBets,
    timeLeft,
    phase,
    isLoading,
    userBalance,
    totalPlayers,
    totalPool,
    lastResult,
    placeBet,
    processResult,
    createRound: createGlobalRound,
    refetchRound: fetchCurrentRound,
    refetchBalance: fetchUserBalance
  };
}
