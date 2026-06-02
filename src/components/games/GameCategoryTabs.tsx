import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GameCategoryTabsProps {
  categories: string[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const categoryConfig: Record<string, { emoji: string; label: string; color: string }> = {
  all: { emoji: "🎮", label: "All", color: "from-purple-500 to-pink-500" },
  crash: { emoji: "🚀", label: "Crash", color: "from-orange-500 to-red-500" },
  casino: { emoji: "🎰", label: "Casino", color: "from-amber-500 to-yellow-500" },
  cards: { emoji: "🃏", label: "Cards", color: "from-red-500 to-pink-500" },
  dice: { emoji: "🎲", label: "Dice", color: "from-blue-500 to-cyan-500" },
  classic: { emoji: "✨", label: "Classic", color: "from-violet-500 to-purple-500" },
  board: { emoji: "♟️", label: "Board", color: "from-slate-500 to-gray-600" },
  action: { emoji: "⚡", label: "Action", color: "from-green-500 to-emerald-500" },
  sports: { emoji: "🏆", label: "Sports", color: "from-teal-500 to-cyan-500" },
  external: { emoji: "🌐", label: "External", color: "from-indigo-500 to-blue-500" },
};

export function GameCategoryTabs({ 
  categories, 
  activeCategory, 
  onCategoryChange 
}: GameCategoryTabsProps) {
  // Ensure 'all' is always first
  const sortedCategories = ['all', ...categories.filter(c => c !== 'all')];

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 pt-1 px-1">
      {sortedCategories.map((category) => {
        const config = categoryConfig[category] || { 
          emoji: "🎲", 
          label: category.charAt(0).toUpperCase() + category.slice(1), 
          color: "from-gray-500 to-gray-600" 
        };
        const isActive = activeCategory === category;

        return (
          <motion.button
            key={category}
            onClick={() => onCategoryChange(category)}
            whileHover={{ scale: 1.06, y: -1 }}
            whileTap={{ scale: 0.93 }}
            className={cn(
              "relative flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all duration-200 min-h-[36px] overflow-hidden",
              isActive
                ? `bg-gradient-to-r ${config.color} text-white`
                : "bg-white/[0.07] text-white/65 hover:bg-white/10 hover:text-white border border-white/10"
            )}
            style={isActive ? {
              boxShadow: '0 8px 20px -6px rgba(168,85,247,0.5), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.25)'
            } : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)' }}
          >
            {isActive && (
              <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
            )}
            <span className="text-sm relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">{config.emoji}</span>
            <span className="relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{config.label}</span>

            {isActive && (
              <motion.div
                layoutId="activeCategoryIndicator"
                className="absolute inset-0 rounded-full ring-1 ring-white/25 pointer-events-none"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
