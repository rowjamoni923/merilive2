import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Diamond, Volume2, VolumeX, HelpCircle, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGameSound } from "@/hooks/useGameSound";
import { placeBet as placeBetService, processWin } from "@/services/gameBalanceService";
import { cn } from "@/lib/utils";

// Card suits and values
const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

interface Card {
  suit: string;
  value: string;
  rank: number;
}

interface Hand {
  cards: Card[];
  score: number;
  name: string;
}

const CHIP_VALUES = [500, 1000, 5000, 10000, 20000];

interface UserProfile {
  id: string;
  coins: number;
  display_name: string;
}

const createDeck = (): Card[] => {
  const deck: Card[] = [];
  SUITS.forEach(suit => {
    VALUES.forEach((value, index) => {
      deck.push({ suit, value, rank: index + 1 });
    });
  });
  return deck;
};

const shuffleDeck = (deck: Card[]): Card[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const evaluateHand = (cards: Card[]): { score: number; name: string } => {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  const isSequence = ranks[0] - ranks[1] === 1 && ranks[1] - ranks[2] === 1;
  const isTriple = ranks[0] === ranks[1] && ranks[1] === ranks[2];
  const isPair = ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2];

  if (isTriple) {
    return { score: 600 + ranks[0], name: "Trail" };
  }
  if (isSequence && isFlush) {
    return { score: 500 + ranks[0], name: "Pure Sequence" };
  }
  if (isSequence) {
    return { score: 400 + ranks[0], name: "Sequence" };
  }
  if (isFlush) {
    return { score: 300 + ranks[0], name: "Color" };
  }
  if (isPair) {
    const pairRank = ranks[0] === ranks[1] ? ranks[0] : ranks[1] === ranks[2] ? ranks[1] : ranks[0];
    return { score: 200 + pairRank, name: "Pair" };
  }
  return { score: ranks[0], name: "High Card" };
};

export const TeenPattiGame = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [hands, setHands] = useState<{ A: Hand | null; B: Hand | null; C: Hand | null }>({
    A: null, B: null, C: null
  });
  const [selectedChip, setSelectedChip] = useState(500);
  const [bets, setBets] = useState<{ A: number; B: number; C: number }>({ A: 0, B: 0, C: 0 });
  const [phase, setPhase] = useState<"betting" | "revealing" | "result">("betting");
  const [timeLeft, setTimeLeft] = useState(30);
  const [winner, setWinner] = useState<"A" | "B" | "C" | null>(null);
  const [cardsRevealed, setCardsRevealed] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [recentWinners, setRecentWinners] = useState<string[]>([]);
  const [allBets, setAllBets] = useState<{ A: number; B: number; C: number }>({ A: 0, B: 0, C: 0 });

  const { playCardFlip, playWinSound, playLoseSound, playBetSound, setMuted } = useGameSound();

  useEffect(() => {
    setMuted(!soundEnabled);
  }, [soundEnabled, setMuted]);

  // Fetch user
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: profileData } = await supabase
          .from("profiles")
          .select("id, diamonds, display_name")
          .eq("id", user.id)
          .single();
        if (profileData) {
          setProfile(profileData as unknown as UserProfile);
        }
      }
    };
    fetchUser();
  }, []);

  // Timer
  useEffect(() => {
    if (phase !== "betting") return;
    
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          dealCards();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase]);

  const placeBet = async (hand: "A" | "B" | "C") => {
    if (phase !== "betting") return;
    
    if (!userId) {
      toast.error("Please login to play");
      return;
    }

    // Server is source of truth — no client-side stale-balance pre-check.
    const betResult = await placeBetService(userId, "teen-patti", "Teen Patti", selectedChip);

    if (!betResult.success) {
      const bal = (betResult as any).newBalance;
      const msg = /insufficient/i.test(betResult.error || '')
        ? `Not enough diamonds${typeof bal === 'number' ? ` (you have ${bal.toLocaleString()})` : ''}`
        : (betResult.error || "Failed to place bet");
      toast.error(msg);
      return;
    }

    setProfile(prev => prev ? { ...prev, coins: betResult.newBalance || 0 } : null);
    setBets(prev => ({ ...prev, [hand]: prev[hand] + selectedChip }));
    setAllBets(prev => ({ ...prev, [hand]: prev[hand] + selectedChip }));
    playBetSound();
  };

  const dealCards = useCallback(() => {
    setPhase("revealing");
    
    // Create and shuffle deck
    const deck = shuffleDeck(createDeck());
    
    // Deal 3 cards to each hand
    const handA: Card[] = [deck[0], deck[1], deck[2]];
    const handB: Card[] = [deck[3], deck[4], deck[5]];
    const handC: Card[] = [deck[6], deck[7], deck[8]];

    const evalA = evaluateHand(handA);
    const evalB = evaluateHand(handB);
    const evalC = evaluateHand(handC);

    setHands({
      A: { cards: handA, ...evalA },
      B: { cards: handB, ...evalB },
      C: { cards: handC, ...evalC }
    });

    // Reveal cards one by one
    setTimeout(async () => {
      setCardsRevealed(true);
      playCardFlip();
      
      // Determine winner
      setTimeout(async () => {
        const scores = { A: evalA.score, B: evalB.score, C: evalC.score };
        const winningHand = Object.entries(scores).reduce((a, b) => 
          a[1] > b[1] ? a : b
        )[0] as "A" | "B" | "C";
        
        setWinner(winningHand);
        setPhase("result");
        setRecentWinners(prev => [winningHand, ...prev.slice(0, 9)]);

        // Calculate winnings
        const myBetOnWinner = bets[winningHand];
        const totalBet = bets.A + bets.B + bets.C;
        
        if (myBetOnWinner > 0 && userId) {
          const winAmount = myBetOnWinner * 2;
          
          // Process win using service
          const winResult = await processWin(userId, "teen-patti", "Teen Patti", winAmount, 2);
          
          if (winResult.success) {
            setProfile(prev => prev ? { ...prev, coins: winResult.newBalance || 0 } : null);
          }
          
          playWinSound();
          toast.success(`🎉 ${winningHand} wins! You won ${winAmount.toLocaleString()} Diamonds!`);
        } else if (totalBet > 0) {
          playLoseSound();
          toast.error(`${winningHand} wins! Better luck next time!`);
        }

        // Reset for next round
        setTimeout(() => {
          setPhase("betting");
          setBets({ A: 0, B: 0, C: 0 });
          setAllBets({ A: 0, B: 0, C: 0 });
          setHands({ A: null, B: null, C: null });
          setWinner(null);
          setCardsRevealed(false);
          setTimeLeft(30);
        }, 5000);
      }, 2000);
    }, 1500);
  }, [bets, profile, userId, playCardFlip, playWinSound, playLoseSound]);

  const CardBack = () => (
    <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-gradient-to-br from-red-500 to-red-700 border-2 border-yellow-400 flex items-center justify-center shadow-lg">
      <div className="w-10 h-14 sm:w-12 sm:h-16 rounded bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center">
        <div className="text-red-600 text-lg font-bold">♦</div>
      </div>
    </div>
  );

  const CardFace = ({ card }: { card: Card }) => {
    const isRed = card.suit === "♥" || card.suit === "♦";
    return (
      <motion.div
        initial={{ rotateY: 180 }}
        animate={{ rotateY: 0 }}
        transition={{ duration: 0.5 }}
        className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-white border-2 border-gray-300 flex flex-col items-center justify-center shadow-lg"
      >
        <span className={cn("text-xs font-bold", isRed ? "text-red-600" : "text-gray-900")}>
          {card.value}
        </span>
        <span className={cn("text-xl", isRed ? "text-red-600" : "text-gray-900")}>
          {card.suit}
        </span>
      </motion.div>
    );
  };

  const HandDisplay = ({ 
    label, 
    hand, 
    betAmount,
    totalBet,
    isWinner,
    onBet
  }: { 
    label: string;
    hand: Hand | null;
    betAmount: number;
    totalBet: number;
    isWinner: boolean;
    onBet: () => void;
  }) => (
    <motion.div
      className={cn(
        "flex flex-col items-center p-3 rounded-2xl transition-all",
        isWinner && "ring-4 ring-yellow-400 bg-yellow-400/10"
      )}
      whileHover={{ scale: phase === "betting" ? 1.02 : 1 }}
      onClick={onBet}
    >
      {/* Label */}
      <span className={cn(
        "text-3xl sm:text-4xl font-bold mb-2",
        label === "A" && "text-orange-400",
        label === "B" && "text-orange-500",
        label === "C" && "text-yellow-400"
      )}>
        {label}
      </span>

      {/* Cards Container */}
      <div className="bg-white/10 backdrop-blur rounded-xl p-2 mb-2">
        <div className="flex gap-1">
          {hand && cardsRevealed ? (
            hand.cards.map((card, i) => (
              <motion.div
                key={i}
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: i * 0.2 }}
              >
                <CardFace card={card} />
              </motion.div>
            ))
          ) : (
            <>
              <CardBack />
              <CardBack />
              <CardBack />
            </>
          )}
        </div>
      </div>

      {/* Hand Name */}
      {hand && cardsRevealed && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-white text-xs font-bold bg-black/30 px-2 py-1 rounded mb-1"
        >
          {hand.name}
        </motion.div>
      )}

      {/* Bet Info */}
      <div className="text-center">
        <p className="text-white/60 text-xs">Total: {totalBet}</p>
        {betAmount > 0 && (
          <p className="text-yellow-400 text-xs">Mine: {betAmount}</p>
        )}
      </div>

      {/* Winner Badge */}
      {isWinner && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mt-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-black px-3 py-1 rounded-full text-xs font-bold"
        >
          WINNER!
        </motion.div>
      )}
    </motion.div>
  );

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #8B0000 0%, #5C0000 50%, #3D0000 100%)"
      }}
    >
      {/* Card Pattern Background */}
      <div 
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 5 L25 15 L20 25 L15 15 Z' fill='%23fff' fill-opacity='0.3'/%3E%3C/svg%3E")`,
          backgroundSize: "40px 40px"
        }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <button 
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="w-10 h-10 rounded-full bg-black/30 flex items-center justify-center"
        >
          {soundEnabled ? (
            <Volume2 className="w-5 h-5 text-white" />
          ) : (
            <VolumeX className="w-5 h-5 text-white/50" />
          )}
        </button>

        {/* Timer */}
        <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-full">
          <span className={cn(
            "text-2xl font-bold",
            timeLeft <= 5 ? "text-red-400 animate-pulse" : "text-white"
          )}>
            {timeLeft}s
          </span>
          <span className="text-2xl">⏰</span>
        </div>

        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
            <History className="w-5 h-5 text-white" />
          </button>
          <button className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Recent Winners */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 overflow-x-auto">
          <span className="text-white/60 text-xs">Recent:</span>
          {recentWinners.map((w, i) => (
            <span 
              key={i}
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                w === "A" && "bg-orange-400 text-black",
                w === "B" && "bg-orange-500 text-black",
                w === "C" && "bg-yellow-400 text-black"
              )}
            >
              {w}
            </span>
          ))}
        </div>
      </div>

      {/* Three Hands */}
      <div className="grid grid-cols-3 gap-2 px-2 sm:px-4">
        <HandDisplay
          label="A"
          hand={hands.A}
          betAmount={bets.A}
          totalBet={allBets.A}
          isWinner={winner === "A"}
          onBet={() => placeBet("A")}
        />
        <HandDisplay
          label="B"
          hand={hands.B}
          betAmount={bets.B}
          totalBet={allBets.B}
          isWinner={winner === "B"}
          onBet={() => placeBet("B")}
        />
        <HandDisplay
          label="C"
          hand={hands.C}
          betAmount={bets.C}
          totalBet={allBets.C}
          isWinner={winner === "C"}
          onBet={() => placeBet("C")}
        />
      </div>

      {/* Diamond Balance */}
      <div className="flex justify-center my-6">
        <motion.div
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <Diamond className="w-12 h-12 text-yellow-400 drop-shadow-lg" />
        </motion.div>
      </div>

      {/* Chip Selector */}
      <div className="flex justify-center gap-2 px-4">
        {CHIP_VALUES.map((value, index) => {
          const colors = [
            "from-green-400 to-green-600",
            "from-red-400 to-red-600",
            "from-blue-400 to-blue-600",
            "from-orange-400 to-orange-600",
            "from-purple-400 to-purple-600"
          ];
          const isSelected = selectedChip === value;
          const isDisabled = (profile?.diamonds || 0) < value;
          
          return (
            <motion.button
              key={value}
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => !isDisabled && setSelectedChip(value)}
              disabled={isDisabled}
              className={cn(
                "w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center font-bold text-white shadow-lg transition-all",
                `bg-gradient-to-br ${colors[index]}`,
                "border-4 border-white/30",
                isSelected && "ring-4 ring-yellow-400 -translate-y-2",
                isDisabled && "opacity-40"
              )}
            >
              {value >= 1000 ? `${value / 1000}K` : value}
            </motion.button>
          );
        })}
        
        {/* Repeat Button */}
        <button className="bg-purple-500/80 text-white px-4 py-2 rounded-lg text-sm font-bold">
          Repeat
        </button>
      </div>

      {/* Balance Display */}
      <div className="flex justify-center mt-4">
        <div className="flex items-center gap-2 bg-black/30 px-4 py-2 rounded-full">
          <Diamond className="w-5 h-5 text-yellow-400" />
          <span className="text-white font-bold">
            {(profile?.diamonds || 0).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
};
