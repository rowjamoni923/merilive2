import { motion } from "framer-motion";
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
}

interface BettingGridProps {
  myBets: Bet[];
  allBets: RouletteBet[];
  onPlaceBet: (betType: string, multiplier: number) => void;
  disabled: boolean;
}

const BETTING_OPTIONS = [
  { type: "0", label: "0", multiplier: 36, color: "green" },
  { type: "1-12", label: "1-12", multiplier: 3, color: "default" },
  { type: "13-24", label: "13-24", multiplier: 3, color: "default" },
  { type: "25-36", label: "25-36", multiplier: 3, color: "default" },
  { type: "red", label: "Red", multiplier: 2, color: "red" },
  { type: "black", label: "Black", multiplier: 2, color: "black" },
  { type: "odd", label: "Odd", multiplier: 2, color: "default" },
  { type: "even", label: "Even", multiplier: 2, color: "default" },
];

export const BettingGrid = ({ myBets, allBets, onPlaceBet, disabled }: BettingGridProps) => {
  
  const getBetStats = (betType: string) => {
    const betsForType = allBets.filter(b => b.bet_type === betType);
    const totalAmount = betsForType.reduce((sum, b) => sum + b.bet_amount, 0);
    const betCount = betsForType.length;
    return { totalAmount, betCount };
  };

  const getMyBetAmount = (betType: string) => {
    return myBets.filter(b => b.type === betType).reduce((sum, b) => sum + b.amount, 0);
  };

  return (
    <div className="grid grid-cols-4 gap-2">
      {BETTING_OPTIONS.map((option) => {
        const stats = getBetStats(option.type);
        const myAmount = getMyBetAmount(option.type);
        
        return (
          <motion.button
            key={option.type}
            whileTap={{ scale: 0.95 }}
            onClick={() => !disabled && onPlaceBet(option.type, option.multiplier)}
            disabled={disabled}
            className={cn(
              "relative rounded-xl transition-all overflow-hidden",
              "flex flex-col items-center justify-center gap-0.5",
              "border-2 py-3",
              disabled && "opacity-50 cursor-not-allowed",
              option.color === "green" && "bg-green-700/40 border-green-500/60 hover:bg-green-600/50",
              option.color === "red" && "bg-red-700/30 border-red-500/50 hover:bg-red-600/40",
              option.color === "black" && "bg-gray-900/50 border-gray-500/40 hover:bg-gray-800/50",
              option.color === "default" && "bg-green-800/30 border-green-500/40 hover:bg-green-700/40"
            )}
          >
            {/* Bet Count Badge */}
            <div className="absolute top-0.5 right-1 text-[9px] text-yellow-300/70 font-medium">
              {stats.betCount}/{stats.totalAmount > 0 ? (stats.totalAmount >= 1000 ? `${(stats.totalAmount/1000).toFixed(0)}K` : stats.totalAmount) : 0}
            </div>

            {/* Label */}
            <span className="text-white font-bold text-lg leading-tight">{option.label}</span>
            
            {/* Multiplier */}
            <span className="text-yellow-400 text-[11px] font-semibold">☓{option.multiplier}</span>

            {/* My Bet Chips */}
            {myAmount > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-br from-yellow-400 to-amber-600 text-black text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg"
              >
                {myAmount >= 1000 ? `${(myAmount/1000).toFixed(0)}K` : myAmount}
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};
