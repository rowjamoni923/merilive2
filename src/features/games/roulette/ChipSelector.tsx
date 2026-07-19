import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Gem } from "lucide-react";

interface ChipSelectorProps {
  selectedChip: number;
  onSelectChip: (value: number) => void;
  balance: number;
}

const CHIPS = [
 { value: 500, bg: "from-slate-400 to-slate-600", ring: "#94a3b8", text: "500", dark: false },
 { value: 1000, bg: "from-green-500 to-green-700", ring: "#22c55e", text: "1K", dark: false },
 { value: 5000, bg: "from-red-500 to-red-700", ring: "#ef4444", text: "5K", dark: false },
 { value: 10000, bg: "from-blue-500 to-blue-700", ring: "#3b82f6", text: "10K", dark: false },
 { value: 50000, bg: "from-orange-500 to-orange-700", ring: "#f97316", text: "50K", dark: false },
 { value: 100000, bg: "from-purple-500 to-purple-700", ring: "#a855f7", text: "100K", dark: false },
];

export const ChipSelector = ({ selectedChip, onSelectChip, balance }: ChipSelectorProps) => {
  return (
    <div className="mt-4">
      {/* Balance display */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <Gem className="w-4 h-4 text-amber-400" />
        <span className="text-white/70 text-sm">{balance.toLocaleString()}</span>
      </div>

      {/* Chips row — horizontal scroll on narrow screens so all chips reachable */}
      <div className="flex justify-center items-end gap-2 overflow-x-auto px-2 pb-1 -mx-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CHIPS.map((chip) => {
          const isSelected = selectedChip === chip.value;
          const isDisabled = balance < chip.value;

          return (
            <motion.button
              key={chip.value}
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.9 }}
              animate={isSelected ? { y: -8 } : { y: 0 }}
              onClick={() => !isDisabled && onSelectChip(chip.value)}
              disabled={isDisabled}
              className={cn(
                "relative w-12 h-12 sm:w-14 sm:h-14 rounded-full transition-shadow shrink-0",
                isDisabled && "opacity-30 cursor-not-allowed"
              )}
            >
              {/* Chip base */}
              <div className={cn(
                "absolute inset-0 rounded-full bg-gradient-to-br shadow-lg",
                chip.bg
              )} />

              {/* Edge dashes (casino chip pattern) */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 56 56">
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i / 12) * Math.PI * 2;
                  const x1 = 28 + Math.cos(angle) * 24;
                  const y1 = 28 + Math.sin(angle) * 24;
                  const x2 = 28 + Math.cos(angle) * 27;
                  const y2 = 28 + Math.sin(angle) * 27;
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                      stroke="rgba(255,255,255,0.5)" strokeWidth="3" strokeLinecap="round" />
                  );
                })}
              </svg>

              {/* Inner circles */}
              <div className="absolute inset-2 rounded-full border-2 border-white/40" />
              <div className="absolute inset-3.5 rounded-full border border-white/25" />

              {/* Value text */}
              <span className={cn(
                "relative z-10 font-bold text-xs drop-shadow",
                chip.dark ? "text-gray-800" : "text-white"
              )}>
                {chip.text}
              </span>

              {/* Selected glow */}
              {isSelected && (
                <motion.div
                  className="absolute -inset-1.5 rounded-full -z-10"
                  style={{ 
                    boxShadow: `0 0 15px 4px ${chip.ring}60, 0 0 30px 8px ${chip.ring}30` 
                  }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};
