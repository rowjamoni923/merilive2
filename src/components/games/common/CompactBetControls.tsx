import { motion } from "framer-motion";
import { Diamond, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CompactBetControlsProps {
  userCoins: number;
  betAmount: number;
  setBetAmount: (amount: number) => void;
  phase: string;
  onPlaceBet?: () => void;
  isPlacingBet?: boolean;
  hasBet?: boolean;
  betLabel?: string;
  disabled?: boolean;
  showDiamondBalance?: boolean;
  presetBets?: number[];
}

const DEFAULT_PRESET_BETS = [500, 1000, 5000, 10000, 20000];

// Format number for display (K = Thousand, M = Million)
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

// Compact Diamond Balance Header
export function DiamondBalanceHeader({ userCoins, rightElement }: { userCoins: number; rightElement?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-1">
      <div className="flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-cyan-500/30 to-purple-500/30 rounded-full border border-cyan-500/40">
        <Diamond className="w-2.5 h-2.5 text-cyan-400" />
        <span className="text-cyan-300 font-bold text-[10px]">{userCoins.toLocaleString()}</span>
      </div>
      {rightElement}
    </div>
  );
}

// Compact Preset Bet Buttons
export function CompactPresetBets({ 
  userCoins, 
  betAmount, 
  setBetAmount, 
  phase,
  presetBets = DEFAULT_PRESET_BETS 
}: CompactBetControlsProps) {
  if (phase !== 'betting') return null;
  
  return (
    <div className="flex justify-center gap-1 py-0.5">
      {presetBets.map((amount) => (
        <motion.button
          key={amount}
          whileTap={{ scale: 0.93 }}
          onClick={() => setBetAmount(amount)}
          disabled={amount > userCoins}
          className={cn(
            "px-1.5 py-0.5 rounded text-[8px] font-bold transition-all",
            betAmount === amount
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-md shadow-purple-500/30"
              : amount > userCoins
                ? "bg-white/5 text-white/30"
                : "bg-white/10 text-white/80 hover:bg-white/20"
          )}
        >
          {formatBetAmount(amount)}
        </motion.button>
      ))}
    </div>
  );
}

// Compact Bet Info Display
export function CompactBetInfo({ betAmount, label = "Your Bet" }: { betAmount: number; label?: string }) {
  return (
    <div className="flex items-center justify-between bg-black/30 rounded-lg px-2 py-1 border border-white/10">
      <span className="text-white/50 text-[9px]">{label}</span>
      <div className="flex items-center gap-1">
        <Diamond className="w-2.5 h-2.5 text-cyan-400" />
        <span className="text-cyan-300 font-bold text-[10px]">{betAmount.toLocaleString()}</span>
      </div>
    </div>
  );
}

// Compact Bet Button
export function CompactBetButton({
  onClick,
  disabled,
  isLoading,
  label = "Place Bet",
  icon,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  label?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "w-full h-10 rounded-lg text-xs font-bold text-white relative overflow-hidden disabled:opacity-50",
        "bg-gradient-to-r from-green-500 to-emerald-600",
        className
      )}
      style={{
        boxShadow: '0 4px 15px rgba(34, 197, 94, 0.3), inset 0 2px 0 rgba(255,255,255,0.2)'
      }}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
      ) : (
        <span className="relative z-10 flex items-center justify-center gap-1.5">
          {icon}
          {label}
        </span>
      )}
    </motion.button>
  );
}

// Status Message Component
export function GameStatusMessage({
  phase,
  hasBet,
  selectedBet,
  timeLeft,
  result,
  isWinner,
  winAmount,
  betAmount,
}: {
  phase: string;
  hasBet: boolean;
  selectedBet?: string | null;
  timeLeft?: number;
  result?: any;
  isWinner?: boolean;
  winAmount?: number;
  betAmount?: number;
}) {
  if (!hasBet) return null;

  if (phase === 'betting' && hasBet) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="py-1 px-2 rounded-lg text-center text-[9px] font-bold bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400"
      >
        ✅ Bet Placed {selectedBet ? `(${selectedBet.toUpperCase()})` : ''} • Waiting {timeLeft}s
      </motion.div>
    );
  }

  if (phase === 'playing') {
    return (
      <motion.div 
        animate={{ opacity: [1, 0.5, 1] }}
        transition={{ duration: 0.5, repeat: Infinity }}
        className="py-1 px-2 rounded-lg text-center text-[9px] font-bold bg-gradient-to-r from-purple-500/20 to-violet-500/20 border border-purple-500/30 text-purple-400"
      >
        🎮 In Progress...
      </motion.div>
    );
  }

  if (result !== undefined && isWinner !== undefined) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "py-1.5 px-2 rounded-lg text-center text-[10px] font-bold",
          isWinner 
            ? "bg-gradient-to-r from-green-500/30 to-emerald-500/30 border border-green-500/40 text-green-400" 
            : "bg-gradient-to-r from-red-500/30 to-rose-500/30 border border-red-500/40 text-red-400"
        )}
      >
        {isWinner 
          ? `🎉 Won ${winAmount?.toLocaleString() || (betAmount ? (betAmount * 2).toLocaleString() : '')}!` 
          : "😢 Better luck next time!"}
      </motion.div>
    );
  }

  return null;
}

// Full Compact Bet Controls (combines all above)
export function FullCompactBetControls({
  userCoins,
  betAmount,
  setBetAmount,
  phase,
  onPlaceBet,
  isPlacingBet = false,
  hasBet = false,
  disabled = false,
  presetBets = DEFAULT_PRESET_BETS,
  buttonLabel = "Place Bet",
  buttonIcon,
}: CompactBetControlsProps & { buttonLabel?: string; buttonIcon?: React.ReactNode }) {
  if (phase !== 'betting' || hasBet) return null;

  return (
    <div className="space-y-1.5">
      {/* Preset bets */}
      <CompactPresetBets 
        userCoins={userCoins}
        betAmount={betAmount}
        setBetAmount={setBetAmount}
        phase={phase}
        presetBets={presetBets}
      />
      
      {/* Bet info */}
      <CompactBetInfo betAmount={betAmount} />
      
      {/* Place bet button */}
      {onPlaceBet && (
        <CompactBetButton
          onClick={onPlaceBet}
          disabled={disabled || betAmount > userCoins}
          isLoading={isPlacingBet}
          label={buttonLabel}
          icon={buttonIcon}
        />
      )}
    </div>
  );
}

export default {
  DiamondBalanceHeader,
  CompactPresetBets,
  CompactBetInfo,
  CompactBetButton,
  GameStatusMessage,
  FullCompactBetControls,
  formatBetAmount,
};
