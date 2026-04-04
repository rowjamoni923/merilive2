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
    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
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
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-200",
              isActive
                ? `bg-gradient-to-r ${config.color} text-white shadow-lg`
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white/80"
            )}
          >
            <span className="text-sm">{config.emoji}</span>
            <span>{config.label}</span>
            
            {isActive && (
              <motion.div
                layoutId="activeCategoryIndicator"
                className="absolute inset-0 rounded-full bg-white/10"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
