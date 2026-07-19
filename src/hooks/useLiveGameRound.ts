import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { updateCachedBalance } from "@/hooks/useUserBalance";

interface LiveGameRound {
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

interface LiveGameBet {
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
  created_at: string;
  profiles?: {
    username: string;
    avatar_url: string;
  };
}

interface UseLiveGameRoundProps {
  gameId: string;
  roomId?: string | null;
  autoStart?: boolean;
  bettingSeconds?: number;
  onWin?: (amount: number) => void;
  onLoss?: (amount: number) => void;
}

// Client-side game simulation for continuous play
interface ClientGameState {
  roundNumber: number;
  phase: 'betting' | 'playing' | 'result';
  timeLeft: number;
  bettingEndAt: number;
  result: any;
}

export function useLiveGameRound({
  gameId,
  roomId = null,
  autoStart = true,
  bettingSeconds = 25,  // Extended to 25 seconds for more betting time
  onWin,
  onLoss
}: UseLiveGameRoundProps) {
  const [currentRound, setCurrentRound] = useState<LiveGameRound | null>(null);
  const [bets, setBets] = useState<LiveGameBet[]>([]);
  const [myBets, setMyBets] = useState<LiveGameBet[]>([]);
  const [timeLeft, setTimeLeft] = useState(bettingSeconds);
  const [isLoading, setIsLoading] = useState(true);
  const [phase, setPhase] = useState<'betting' | 'playing' | 'result' | 'waiting'>('betting');
  const [lastWinAmount, setLastWinAmount] = useState(0);
  const [lastLossAmount, setLastLossAmount] = useState(0);
  
  // Client-side game state for continuous play
  const [clientState, setClientState] = useState<ClientGameState>({
    roundNumber: 1,
    phase: 'betting',
    timeLeft: bettingSeconds,
    bettingEndAt: Date.now() + bettingSeconds * 1000,
    result: null
  });
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const roundChannelRef = useRef<any>(null);
  const betsChannelRef = useRef<any>(null);
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null);
  const processedRoundsRef = useRef<Set<number>>(new Set());

  // Step 2 perf: stabilize callbacks via refs so the phase-transition effect
  // doesn't re-create timers whenever the parent re-renders with new lambdas.
  const onWinRef = useRef(onWin);
  const onLossRef = useRef(onLoss);
  useEffect(() => { onWinRef.current = onWin; }, [onWin]);
  useEffect(() => { onLossRef.current = onLoss; }, [onLoss]);

  // Games that handle their own result processing (coins update)
  // These games have their own card dealing/wheel spinning logic and timer
  // IMPORTANT: Define this BEFORE startGameLoop which depends on it
  const selfManagedGames = ['teen_patti', 'teen-patti', 'ferris_wheel', 'ferris-wheel', 'roulette', 'lucky_number', 'rocket_race'];
  const isSelfManagedGame = selfManagedGames.includes(gameId);


  // Generate game result based on game type
  const generateResult = useCallback(() => {
    switch (gameId) {
      case 'dragon_tiger':
        const cards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const dragonCard = cards[Math.floor(Math.random() * cards.length)];
        const tigerCard = cards[Math.floor(Math.random() * cards.length)];
        const dragonValue = cards.indexOf(dragonCard);
        const tigerValue = cards.indexOf(tigerCard);
        let winner = 'tie';
        if (dragonValue > tigerValue) winner = 'dragon';
        else if (tigerValue > dragonValue) winner = 'tiger';
        return { winner, dragonCard, tigerCard };
        
      case 'crash':
      case 'aviator':
        const crashPoint = 1 + Math.random() * 9; // 1x to 10x
        return { crashPoint: parseFloat(crashPoint.toFixed(2)) };
        
      case 'lucky_28':
        const dice1 = Math.ceil(Math.random() * 6);
        const dice2 = Math.ceil(Math.random() * 6);
        const dice3 = Math.ceil(Math.random() * 6);
        const total = dice1 + dice2 + dice3;
        return { 
          dice: [dice1, dice2, dice3], 
          total,
          isBig: total >= 14,
          isOdd: total % 2 === 1
        };
        
      case 'plinko':
        const multipliers = [10, 5, 3, 2, 1.5, 1, 1.5, 2, 3, 5, 10];
        const slot = Math.floor(Math.random() * multipliers.length);
        return { slot, multiplier: multipliers[slot] };
        
      case 'andar_bahar':
        const abCards = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
        const joker = abCards[Math.floor(Math.random() * abCards.length)];
        const abWinner = Math.random() > 0.5 ? 'andar' : 'bahar';
        return { joker, winner: abWinner };
        
      case 'teen-patti':
      case 'teen_patti':
        // Teen Patti uses its own internal card dealing
        const teenPattiWinner = ['A', 'B', 'C'][Math.floor(Math.random() * 3)];
        return { winner: teenPattiWinner };
        
      case 'ferris-wheel':
      case 'ferris_wheel':
        // Ferris wheel uses its own internal spinning
        const foods = ['🍕', '🍔', '🌮', '🍟', '🍩', '🍦', '🎂', '🍪'];
        const winningFood = Math.floor(Math.random() * foods.length);
        return { winner: winningFood, food: foods[winningFood] };
        
      case 'roulette':
        // Roulette uses its own internal wheel
        const rouletteNumber = Math.floor(Math.random() * 37); // 0-36
        const isRouletteRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36].includes(rouletteNumber);
        return { 
          number: rouletteNumber, 
          color: rouletteNumber === 0 ? 'green' : (isRouletteRed ? 'red' : 'black'),
          isEven: rouletteNumber > 0 && rouletteNumber % 2 === 0,
          isLow: rouletteNumber >= 1 && rouletteNumber <= 18
        };
        
      default:
        return { winner: Math.random() > 0.5 ? 'a' : 'b' };
    }
  }, [gameId]);

  // Start client-side game loop (always running)
  // CRITICAL: Skip for self-managed games that have their own timer
  const startGameLoop = useCallback(() => {
    // Self-managed games handle their own timer - don't run game loop
    if (isSelfManagedGame) {
      console.log(`[useLiveGameRound] Skipping game loop for ${gameId} - uses own timer`);
      return () => {};
    }
    
    // Clear existing loop
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current);
    }

    const runGameCycle = () => {
      setClientState(prev => {
        const now = Date.now();
        
        if (prev.phase === 'betting') {
          const remaining = Math.max(0, Math.ceil((prev.bettingEndAt - now) / 1000));
          
          if (remaining <= 0) {
            // Transition to playing phase with result
            const result = generateResult();
            return {
              ...prev,
              phase: 'playing',
              timeLeft: 0,
              result
            };
          }

          // Avoid unnecessary re-renders when the displayed second did not change
          if (remaining === prev.timeLeft) {
            return prev;
          }
          
          return { ...prev, timeLeft: remaining };
        }
        
        return prev;
      });
    };

    gameLoopRef.current = setInterval(runGameCycle, 250);
    
    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
    };
  }, [generateResult, isSelfManagedGame, gameId]);

  // Handle phase transitions
  // CRITICAL: Self-managed games control their own phases - skip automatic transitions
  useEffect(() => {
    // Skip ALL automatic phase transitions for self-managed games
    if (isSelfManagedGame) {
      return; // These games manage their own timer and phase changes
    }
    
    if (clientState.phase === 'playing' && clientState.result) {
      // Playing phase - process results after 2 seconds
      const timer = setTimeout(async () => {
        // Process results for current bets
        const roundNum = clientState.roundNumber;
        
        // Avoid processing same round twice
        if (processedRoundsRef.current.has(roundNum)) {
          setClientState(p => ({ ...p, phase: 'result' }));
          return;
        }
        processedRoundsRef.current.add(roundNum);
        
        // Skip auto-processing for self-managed games
        // They handle their own win/loss logic and coin updates
        if (isSelfManagedGame) {
          console.log(`[useLiveGameRound] Skipping auto-processing for ${gameId} - game handles its own results`);
          setClientState(p => ({ ...p, phase: 'result' }));
          return;
        }
        
        // Calculate winners
        const result = clientState.result;
        let winningValue = '';
        
        if (result.winner) {
          winningValue = result.winner;
        } else if (result.isBig !== undefined) {
          winningValue = result.isBig ? 'big' : 'small';
        }
        
        // Process each bet
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          let totalWin = 0;
          let totalLoss = 0;
          
          for (const bet of myBets) {
            const isWinner = bet.bet_value === winningValue || 
              (result.isOdd !== undefined && (
                (bet.bet_value === 'odd' && result.isOdd) ||
                (bet.bet_value === 'even' && !result.isOdd)
              ));
            
            if (isWinner) {
              const multiplier = getMultiplier(gameId, bet.bet_value || '');
              const winAmount = Math.floor(bet.bet_amount * multiplier);
              totalWin += winAmount;
              
              // Credit winnings using process_game_win (allows self-crediting)
              const { data: winResult, error: winError } = await supabase.rpc('process_game_win', {
                p_user_id: user.id,
                p_amount: winAmount,
                p_game_id: gameId,
                p_game_name: gameId,
                p_multiplier: multiplier,
                p_is_jackpot: false,
              });
              
              if (!winError) {
                const winData = winResult as any;
                if (winData?.success && winData?.new_balance !== undefined) {
                  updateCachedBalance(winData.new_balance);
                }
              }
            } else {
              totalLoss += bet.bet_amount;
            }
          }
          
          if (totalWin > 0) {
            setLastWinAmount(totalWin);
            onWinRef.current?.(totalWin);
            toast.success(`🎉 You won ${totalWin.toLocaleString()} coins!`);
          } else if (totalLoss > 0 && myBets.length > 0) {
            setLastLossAmount(totalLoss);
            onLossRef.current?.(totalLoss);
          }

        }
        
        setClientState(p => ({ ...p, phase: 'result' }));
      }, 2000);
      
      return () => clearTimeout(timer);
    }
    
    if (clientState.phase === 'result') {
      // Result phase - start new round after 2 seconds
      const timer = setTimeout(() => {
        // Clear bets for new round
        setBets([]);
        setMyBets([]);
        setLastWinAmount(0);
        setLastLossAmount(0);
        
        setClientState({
          roundNumber: clientState.roundNumber + 1,
          phase: 'betting',
          timeLeft: bettingSeconds,
          bettingEndAt: Date.now() + bettingSeconds * 1000,
          result: null
        });
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [clientState.phase, clientState.result, clientState.roundNumber, myBets, gameId, bettingSeconds, isSelfManagedGame]);

  // Sync client state to component state. Step 2 perf: depend on primitive
  // fields only so the virtual round object isn't rebuilt on every 250ms tick
  // — it now changes only when phase/round/result/bets actually change.
  const bettingEndAtMs = clientState.bettingEndAt;
  const resultJson = clientState.result ? JSON.stringify(clientState.result) : null;
  useEffect(() => {
    setPhase(clientState.phase === 'result' ? 'result' : clientState.phase);
  }, [clientState.phase]);
  useEffect(() => {
    setTimeLeft(clientState.timeLeft);
  }, [clientState.timeLeft]);
  useEffect(() => {
    setCurrentRound({
      id: `client-${gameId}-${clientState.roundNumber}`,
      game_id: gameId,
      room_id: roomId,
      round_number: clientState.roundNumber,
      status: clientState.phase === 'result' ? 'completed' : clientState.phase,
      betting_end_at: new Date(bettingEndAtMs).toISOString(),
      game_start_at: null,
      game_end_at: null,
      result: clientState.result,
      total_bets: bets.length,
      total_bet_amount: bets.reduce((sum, b) => sum + b.bet_amount, 0),
      total_players: new Set(bets.map(b => b.user_id)).size,
      winning_value: clientState.result?.winner || null,
      created_at: new Date(bettingEndAtMs).toISOString()
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, roomId, clientState.roundNumber, clientState.phase, bettingEndAtMs, resultJson, bets.length]);


  // Place a bet - ULTRA-FAST with optimistic updates (sub-100ms response)
  const placeBet = useCallback(async (
    betAmount: number,
    betType?: string,
    betValue?: string
  ): Promise<{ success: boolean; error?: string; new_balance?: number }> => {
    console.log('[placeBet] ⚡ INSTANT start:', { phase: clientState.phase, betAmount, betType, betValue });
    
    if (clientState.phase !== 'betting') {
      return { success: false, error: 'Betting is closed' };
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Please login' };
    }

    // OPTIMISTIC: Create bet immediately for instant UI feedback
    const newBet: LiveGameBet = {
      id: `bet-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      round_id: `client-${gameId}-${clientState.roundNumber}`,
      user_id: user.id,
      bet_amount: betAmount,
      bet_type: betType || null,
      bet_value: betValue || null,
      win_amount: 0,
      multiplier: 1,
      is_winner: false,
      is_processed: false,
      created_at: new Date().toISOString()
    };

    // INSTANT: Add to local state immediately (optimistic update)
    setBets(prev => [...prev, newBet]);
    setMyBets(prev => [...prev, newBet]);

    // PARALLEL: Run profile fetch and coin deduction concurrently
    // Use Promise.all for maximum speed
    try {
      // First get current coins (use maybeSingle to avoid throwing when row not found / RLS)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('coins')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        console.error('[placeBet] profile fetch error:', profileError);
        // Rollback optimistic update
        setBets(prev => prev.filter(b => b.id !== newBet.id));
        setMyBets(prev => prev.filter(b => b.id !== newBet.id));
        return { success: false, error: 'Could not verify balance, please retry' };
      }

      if (profile && profile.coins < betAmount) {
        // Rollback optimistic update
        setBets(prev => prev.filter(b => b.id !== newBet.id));
        setMyBets(prev => prev.filter(b => b.id !== newBet.id));
        return { success: false, error: 'Not enough coins' };
      }

      // PARALLEL: Atomic deduct coins and save bet history simultaneously
      const [updateResult, betInsertResult] = await Promise.all([
        // Atomic coin deduction (race-condition safe)
        supabase.rpc('deduct_diamonds', { p_user_id: user.id, p_amount: betAmount }),
        
        // Save bet to history (fire-and-forget)
        supabase
          .from('game_bets')
          .insert({
            user_id: user.id,
            game_id: gameId,
            bet_amount: betAmount,
            bet_type: betType || 'bet',
            bet_value: betValue || null,
            is_winner: null,
            win_amount: null
          })
      ]);
      
      if (updateResult.error) {
        console.error('[placeBet] ❌ Failed to deduct coins:', updateResult.error);
        // Rollback optimistic update
        setBets(prev => prev.filter(b => b.id !== newBet.id));
        setMyBets(prev => prev.filter(b => b.id !== newBet.id));
        return { success: false, error: 'Failed to place bet' };
      }

      // CRITICAL: Update global cached balance so Profile reflects instantly
      const deductResult = updateResult.data as any;
      if (deductResult?.new_balance !== undefined) {
        updateCachedBalance(deductResult.new_balance);
      }

      console.log('[placeBet] ✅ SUCCESS in <100ms:', newBet.id);
      return { success: true, new_balance: deductResult?.new_balance ?? ((profile?.coins ?? 0) - betAmount) };
    } catch (error) {
      console.error('[placeBet] ❌ Error:', error);
      // Rollback on any error
      setBets(prev => prev.filter(b => b.id !== newBet.id));
      setMyBets(prev => prev.filter(b => b.id !== newBet.id));
      return { success: false, error: 'Failed to place bet' };
    }
  }, [clientState.phase, clientState.roundNumber, gameId]);

  // Process round result (auto-called by game loop)
  const processResult = useCallback(async (
    winningValue: string,
    result: any = {}
  ) => {
    // Process winners from current bets
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const userBets = myBets.filter(b => b.bet_value === winningValue);
    let totalWin = 0;

    for (const bet of userBets) {
      const multiplier = getMultiplier(gameId, winningValue);
      totalWin += bet.bet_amount * multiplier;
    }

    if (totalWin > 0) {
      // Credit winnings using process_game_win (allows self-crediting)
      const { data: winResult, error: winError } = await supabase.rpc('process_game_win', {
        p_user_id: user.id,
        p_amount: Math.floor(totalWin),
        p_game_id: gameId,
        p_game_name: gameId,
        p_multiplier: null,
        p_is_jackpot: false,
      });
      
      if (!winError) {
        const winData = winResult as any;
        if (winData?.success && winData?.new_balance !== undefined) {
          updateCachedBalance(winData.new_balance);
        }
      }
    }

    // Clear bets for new round
    setBets([]);
    setMyBets([]);

    return { totalWin };
  }, [myBets, gameId]);

  // Get multiplier for winning bet
  const getMultiplier = (gameId: string, betValue: string): number => {
    switch (gameId) {
      case 'dragon_tiger':
        return betValue === 'tie' ? 8 : 2;
      case 'lucky_28':
        return 2;
      case 'andar_bahar':
        return 2;
      case 'crash':
      case 'aviator':
        return 2;
      case 'plinko':
        return 2;
      default:
        return 2;
    }
  };

  // Create new round (client-side)
  const createRound = useCallback(async () => {
    setClientState({
      roundNumber: clientState.roundNumber + 1,
      phase: 'betting',
      timeLeft: bettingSeconds,
      bettingEndAt: Date.now() + bettingSeconds * 1000,
      result: null
    });
    return `client-${gameId}-${clientState.roundNumber + 1}`;
  }, [clientState.roundNumber, bettingSeconds, gameId]);

  // Initialize game loop
  useEffect(() => {
    setIsLoading(false);
    
    if (autoStart) {
      startGameLoop();
    }

    return () => {
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current);
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [autoStart, startGameLoop]);

  // Reset bets when new round starts
  useEffect(() => {
    if (clientState.phase === 'betting' && clientState.timeLeft === bettingSeconds) {
      setBets([]);
      setMyBets([]);
    }
  }, [clientState.phase, clientState.timeLeft, bettingSeconds]);

  return {
    currentRound,
    bets,
    myBets,
    timeLeft,
    phase,
    isLoading,
    placeBet,
    processResult,
    createRound,
    refetchRound: () => Promise.resolve(currentRound),
    gameResult: clientState.result,
    lastWinAmount,
    lastLossAmount
  };
}
