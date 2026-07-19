import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Diamond, History, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useGameSound } from "@/hooks/useGameSound";
import { placeBet as placeBetService, processWin } from "@/services/gameBalanceService";
import { cn } from "@/lib/utils";
import ferrisWheelImage from "@/assets/ferris-wheel.svg";

// Food items on the wheel with multipliers
const WHEEL_ITEMS = [
  { id: 1, emoji: "🍇", name: "Grapes", multiplier: 5, color: "from-purple-400 to-purple-600" },
  { id: 2, emoji: "🥕", name: "Carrot", multiplier: 5, color: "from-orange-400 to-orange-600" },
  { id: 3, emoji: "🍓", name: "Strawberry", multiplier: 5, color: "from-red-400 to-red-600" },
  { id: 4, emoji: "🍎", name: "Apple", multiplier: 10, color: "from-red-500 to-red-700" },
  { id: 5, emoji: "🍕", name: "Pizza", multiplier: 45, color: "from-yellow-400 to-orange-500" },
  { id: 6, emoji: "🍔", name: "Burger", multiplier: 25, color: "from-amber-400 to-amber-600" },
  { id: 7, emoji: "🍟", name: "Fries", multiplier: 15, color: "from-yellow-300 to-yellow-500" },
  { id: 8, emoji: "🧁", name: "Cupcake", multiplier: 5, color: "from-pink-400 to-pink-600" },
];

const CHIP_VALUES = [500, 1000, 5000, 10000, 20000];

interface UserProfile {
  id: string;
  coins: number;
  display_name: string;
}

export const FerrisWheelGame = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selectedFood, setSelectedFood] = useState<number | null>(null);
  const [selectedChip, setSelectedChip] = useState(500);
  const [isSpinning, setIsSpinning] = useState(false);
  const [winningIndex, setWinningIndex] = useState<number | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);
  const [timeLeft, setTimeLeft] = useState(20);
  const [phase, setPhase] = useState<"betting" | "spinning" | "result">("betting");
  const [todayProfit, setTodayProfit] = useState(0);
  const [showRules, setShowRules] = useState(false);
  const [recentResults, setRecentResults] = useState<number[]>([]);

  const { playSpinSound, playWinSound, playLoseSound, playBetSound, setMuted } = useGameSound();

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
          if (selectedFood !== null) {
            spinWheel();
          } else {
            // No bet placed, reset timer
            return 20;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, selectedFood]);

  const selectFood = (index: number) => {
    if (phase !== "betting" || isSpinning) return;
    
    if (!userId) {
      toast.error("Please login to play");
      return;
    }

    // Server validates balance during spinWheel via place_game_bet RPC.
    // Selecting a slot must not be blocked by stale cached coins.

    setSelectedFood(index);
    playBetSound();
  };

  const spinWheel = useCallback(async () => {
    if (selectedFood === null || !profile || !userId) return;

    setPhase("spinning");
    setIsSpinning(true);
    playSpinSound();

    // Deduct bet using service
    const betResult = await placeBetService(userId, "ferris-wheel", "Ferris Wheel", selectedChip);
    
    if (!betResult.success) {
      toast.error(betResult.error || "Failed to place bet");
      setPhase("betting");
      setIsSpinning(false);
      return;
    }

    const newBalance = betResult.newBalance || 0;
    setProfile({ ...profile, coins: newBalance });

    // Determine winner (with slight house edge)
    const random = Math.random();
    let winIndex: number;
    
    // Higher multipliers have lower chance
    const weights = WHEEL_ITEMS.map(item => 1 / item.multiplier);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    winIndex = 0;
    
    for (let i = 0; i < weights.length; i++) {
      cumulative += weights[i] / totalWeight;
      if (random < cumulative) {
        winIndex = i;
        break;
      }
    }

    // Animate wheel
    setTimeout(async () => {
      setWinningIndex(winIndex);
      setIsSpinning(false);
      setPhase("result");

      // Check if won
      if (winIndex === selectedFood) {
        const winAmount = selectedChip * WHEEL_ITEMS[winIndex].multiplier;
        
        // Process win using service
        const winResult = await processWin(
          userId, 
          "ferris-wheel", 
          "Ferris Wheel", 
          winAmount, 
          WHEEL_ITEMS[winIndex].multiplier
        );
        
        if (winResult.success) {
          setProfile(prev => prev ? { ...prev, coins: winResult.newBalance || 0 } : null);
        }
        
        setTodayProfit(prev => prev + winAmount - selectedChip);
        playWinSound();
        toast.success(`🎉 You won ${winAmount.toLocaleString()} Diamonds!`);
      } else {
        setTodayProfit(prev => prev - selectedChip);
        playLoseSound();
        toast.error(`The wheel landed on ${WHEEL_ITEMS[winIndex].emoji}!`);
      }

      setRecentResults(prev => [winIndex, ...prev.slice(0, 9)]);

      // Reset for next round
      setTimeout(() => {
        setPhase("betting");
        setSelectedFood(null);
        setWinningIndex(null);
        setTimeLeft(20);
        setRoundNumber(prev => prev + 1);
      }, 3000);
    }, 4000);
  }, [selectedFood, profile, userId, selectedChip, playSpinSound, playWinSound, playLoseSound]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-sky-200 to-sky-300 relative overflow-hidden">
      {/* Floating clouds */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-32 h-16 bg-white/40 rounded-full blur-xl"
            style={{ top: `${10 + i * 15}%`, left: `${-20 + i * 25}%` }}
            animate={{ x: [0, 100, 0] }}
            transition={{ duration: 20 + i * 5, repeat: Infinity, ease: "linear" }}
          />
        ))}
      </div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between p-4">
        <div className="bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow">
          <span className="text-gray-700 font-bold">Round: {roundNumber}</span>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => setShowRules(true)}
            className="bg-white/80 backdrop-blur px-4 py-2 rounded-full shadow text-gray-700"
          >
            Records
          </button>
          <button 
            onClick={() => setShowRules(true)}
            className="bg-red-400 text-white px-4 py-2 rounded-full shadow"
          >
            Rules
          </button>
        </div>
      </div>

      {/* Ferris Wheel */}
      <div className="relative flex justify-center items-center py-8">
        <div className="relative w-80 h-80">
          {/* Wheel Image */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{ rotate: isSpinning ? 720 : 0 }}
            transition={{ duration: 4, ease: "easeOut" }}
          >
            <img loading="lazy" decoding="async" 
              src={ferrisWheelImage} 
              alt="Ferris Wheel" 
              className="w-full h-full object-contain" />
          </motion.div>

          {/* Center Display - Timer Overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex flex-col items-center justify-center text-white shadow-xl border-4 border-yellow-300">
              <span className="text-xs font-medium">Select</span>
              <span className="text-2xl font-bold">{timeLeft}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Wheel Stand */}
      <div className="flex justify-center -mt-4">
        <div className="w-48 h-8 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-t-lg" />
      </div>
      <div className="flex justify-center">
        <div className="w-64 h-16 bg-gradient-to-b from-blue-400 to-blue-600 rounded-lg shadow-lg" />
      </div>

      {/* Food Item Selection Grid - BETTING AREA */}
      <div className="px-4 mt-4">
        <p className="text-center text-white/80 font-bold text-sm mb-2">
          {phase === "betting" ? "🎯 Select a food to bet on:" : phase === "spinning" ? "🎡 Spinning..." : "📊 Result!"}
        </p>
        <div className="grid grid-cols-4 gap-2">
          {WHEEL_ITEMS.map((item, index) => (
            <motion.button
              key={item.id}
              onClick={() => selectFood(index)}
              whileTap={{ scale: 0.9 }}
              disabled={phase !== "betting"}
              className={cn(
                "relative flex flex-col items-center justify-center p-2 rounded-xl shadow-lg transition-all border-2",
                "bg-white/90 backdrop-blur",
                selectedFood === index
                  ? "border-yellow-400 ring-2 ring-yellow-300 bg-yellow-50"
                  : "border-white/30",
                phase !== "betting" && "opacity-60",
                winningIndex === index && phase === "result" && "border-green-500 ring-2 ring-green-400 bg-green-50"
              )}
            >
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-gray-700 text-[10px] font-bold">{item.name}</span>
              <span className={cn(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5",
                `bg-gradient-to-r ${item.color} text-white`
              )}>
                ×{item.multiplier}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Chip Selector */}
      <div className="flex justify-center gap-3 mt-4 px-4">
        {CHIP_VALUES.map((value) => (
          <motion.button
            key={value}
            onClick={() => setSelectedChip(value)}
            whileTap={{ scale: 0.9 }}
            className={cn(
              "w-16 h-16 rounded-xl flex flex-col items-center justify-center shadow-lg transition-all",
              "bg-white border-2",
              selectedChip === value 
                ? "border-yellow-400 ring-2 ring-yellow-300" 
                : "border-gray-200"
            )}
          >
            <Diamond className="w-4 h-4 text-pink-500" />
            <span className="text-gray-700 font-bold text-sm">{value >= 1000 ? `${value / 1000}K` : value}</span>
          </motion.button>
        ))}
      </div>

      {/* Balance & Profit */}
      <div className="flex justify-center gap-4 mt-4 px-4">
        <div className="bg-white/80 backdrop-blur rounded-xl px-4 py-2 flex items-center gap-2 shadow">
          <span className="text-gray-600 text-sm">Gold balance</span>
          <Diamond className="w-4 h-4 text-pink-500" />
          <span className="font-bold text-gray-800">{(profile?.diamonds || 0).toLocaleString()}</span>
        </div>
        <div className="bg-white/80 backdrop-blur rounded-xl px-4 py-2 flex items-center gap-2 shadow">
          <span className="text-gray-600 text-sm">Today's profit</span>
          <Diamond className="w-4 h-4 text-pink-500" />
          <span className={cn("font-bold", todayProfit >= 0 ? "text-green-600" : "text-red-600")}>
            {todayProfit >= 0 ? "+" : ""}{todayProfit.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Recent Results */}
      <div className="mt-4 px-4">
        <div className="bg-white/80 backdrop-blur rounded-xl p-3 shadow">
          <div className="flex items-center gap-2">
            <span className="text-gray-600 text-sm">Result</span>
            <div className="flex gap-1 overflow-x-auto">
              {recentResults.map((idx, i) => (
                <span key={i} className="text-xl">{WHEEL_ITEMS[idx]?.emoji}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Win Animation Overlay */}
      <AnimatePresence>
        {phase === "result" && winningIndex === selectedFood && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0 }}
              className="bg-gradient-to-br from-yellow-400 to-orange-500 rounded-3xl p-8 text-center shadow-2xl"
            >
              <span className="text-6xl">{WHEEL_ITEMS[winningIndex].emoji}</span>
              <p className="text-white text-2xl font-bold mt-4">
                🎉 You Won!
              </p>
              <p className="text-white text-xl">
                +{(selectedChip * WHEEL_ITEMS[winningIndex].multiplier).toLocaleString()} 💎
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
