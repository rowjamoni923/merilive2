import { motion } from "framer-motion";
import { Diamond } from "lucide-react";
import { cn } from "@/lib/utils";

interface BetControlsProps {
  userDiamonds: number;
  betAmount: number;
  setBetAmount: (amount: number) => void;
  phase: string;
  presetBets?: number[];
}

// Default preset bets - Updated
const DEFAULT_PRESET_BETS = [500, 1000, 5000, 10000, 20000];

// Format number for display (K = thousand, M = million)
export const formatBetAmount = (amount: number): string => {
  if (amount >= 1000000) {
    const m = amount / 1000000;
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return amount.toString();
};

export function DiamondBalanceDisplay({ userDiamonds }: { userDiamonds: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-2">
      <div className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-cyan-500/30 to-purple-500/30 rounded-full border border-cyan-500/50">
        <Diamond className="w-4 h-4 text-cyan-400" />
        <span className="text-cyan-300 font-bold text-sm">
          {userDiamonds.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

export function PresetBetButtons({ 
  userDiamonds, 
  betAmount, 
  setBetAmount, 
  phase,
  presetBets = DEFAULT_PRESET_BETS 
}: BetControlsProps) {
  if (phase !== 'betting') return null;
  
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 bg-black/20 rounded-lg p-2">
      <span className="text-white/40 text-[9px] mr-1">Bet:</span>
      {presetBets.map((amount) => (
        <motion.button
          key={amount}
          whileTap={{ scale: 0.95 }}
          onClick={() => setBetAmount(amount)}
          disabled={amount > userDiamonds}
          className={cn(
            "px-2 py-1 rounded-md text-[10px] font-bold transition-all",
            betAmount === amount
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md"
              : amount > userDiamonds
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/80 hover:bg-white/20"
          )}
        >
          {formatBetAmount(amount)}
        </motion.button>
      ))}
    </div>
  );
}

export function CurrentBetDisplay({ betAmount }: { betAmount: number }) {
  return (
    <div className="flex items-center justify-between bg-black/30 rounded-lg p-2">
      <span className="text-white/60 text-xs">Your Bet:</span>
      <div className="flex items-center gap-1">
        <Diamond className="w-3 h-3 text-cyan-400" />
        <span className="text-cyan-300 font-bold text-sm">{betAmount.toLocaleString()}</span>
      </div>
    </div>
  );
}

export function BetResultMessage({ 
  isWinner, 
  betAmount, 
  winAmount 
}: { 
  isWinner: boolean; 
  betAmount: number;
  winAmount?: number;
}) {
  return (
    <div className={cn(
      "p-2 rounded-lg text-center text-xs font-bold",
      isWinner 
        ? "bg-green-500/20 text-green-400" 
        : "bg-red-500/20 text-red-400"
    )}>
      {isWinner 
        ? `🎉 You Won ${(winAmount || betAmount * 2).toLocaleString()} diamonds!` 
        : `😢 You Lost ${betAmount.toLocaleString()} diamonds`}
    </div>
  );
}
