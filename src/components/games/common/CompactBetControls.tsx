import { motion } from "framer-motion";
import { Diamond, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface CompactBetControlsProps {
  userDiamonds: number;
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
export function DiamondBalanceHeader({ userDiamonds, rightElement }: { userDiamonds: number; rightElement?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-1">
      <div
        className="flex items-center gap-1 px-2.5 py-1 rounded-full relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(34,211,238,0.28), rgba(168,85,247,0.28))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 8px -2px rgba(34,211,238,0.35)',
          border: '1px solid rgba(34,211,238,0.4)'
        }}
      >
        <Diamond className="w-2.5 h-2.5 text-cyan-300 drop-shadow-[0_1px_2px_rgba(34,211,238,0.5)]" />
        <span className="text-cyan-200 font-bold text-[10px] tracking-wide">{userDiamonds.toLocaleString()}</span>
      </div>
      {rightElement}
    </div>
  );
}

// Compact Preset Bet Buttons
export function CompactPresetBets({ 
  userDiamonds, 
  betAmount, 
  setBetAmount, 
  phase,
  presetBets = DEFAULT_PRESET_BETS 
}: CompactBetControlsProps) {
  if (phase !== 'betting') return null;
  
  return (
    <div className="flex justify-center gap-1 py-0.5">
      {presetBets.map((amount) => {
        const active = betAmount === amount;
        const disabled = amount > userDiamonds;
        return (
          <motion.button
            key={amount}
            whileHover={!disabled ? { y: -1, scale: 1.04 } : undefined}
            whileTap={{ scale: 0.92 }}
            onClick={() => setBetAmount(amount)}
            disabled={disabled}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all min-w-[44px] relative overflow-hidden",
              active
                ? "text-white"
                : disabled
                  ? "bg-white/[0.04] text-white/30 border border-white/5"
                  : "bg-white/[0.08] text-white/85 hover:bg-white/15 border border-white/10"
            )}
            style={active ? {
              background: 'radial-gradient(120% 120% at 30% 20%, #f0abfc 0%, #a855f7 50%, #6d28d9 100%)',
              boxShadow: '0 6px 14px -4px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 4px rgba(0,0,0,0.3)'
            } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
          >
            {active && <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />}
            <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">{formatBetAmount(amount)}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// Compact Bet Info Display
export function CompactBetInfo({ betAmount, label = "Your Bet" }: { betAmount: number; label?: string }) {
  return (
    <div
      className="flex items-center justify-between rounded-lg px-2.5 py-1.5"
      style={{
        background: 'linear-gradient(180deg, rgba(0,0,0,0.4), rgba(0,0,0,0.25))',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)'
      }}
    >
      <span className="text-white/55 text-[9px] uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-1">
        <Diamond className="w-2.5 h-2.5 text-cyan-300" />
        <span className="text-cyan-200 font-bold text-[10px]">{betAmount.toLocaleString()}</span>
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
      whileHover={!disabled ? { y: -1, scale: 1.02 } : undefined}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={disabled || isLoading}
      className={cn(
        "w-full h-10 rounded-xl text-xs font-extrabold tracking-wide text-white relative overflow-hidden disabled:opacity-50",
        className
      )}
      style={{
        background: 'radial-gradient(120% 120% at 30% 20%, #86efac 0%, #22c55e 45%, #15803d 100%)',
        boxShadow: '0 8px 20px -6px rgba(34,197,94,0.55), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.3)'
      }}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin mx-auto relative" />
      ) : (
        <span className="relative z-10 flex items-center justify-center gap-1.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
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
  userDiamonds,
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
        userDiamonds={userDiamonds}
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
          disabled={disabled || betAmount > userDiamonds}
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
