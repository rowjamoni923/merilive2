import { Phone, Diamond } from "lucide-react";
import { motion } from "framer-motion";
import { useHostCallRate } from "@/hooks/useHostCallRate";
import { toast } from "sonner";

interface CallButtonProps {
  hostId: string;
  onClick: () => void;
  size?: "sm" | "md" | "lg";
  showRate?: boolean;
  className?: string;
  /** Pre-fetched call rate to avoid N+1 queries */
  preloadedRate?: number | null;
}

export function CallButton({ 
  hostId, 
  onClick, 
  size = "md", 
  showRate = true,
  className = "",
  preloadedRate,
}: CallButtonProps) {
  // Only fetch if no preloaded rate is provided (avoids N+1 queries on list pages)
  const { callRate: fetchedRate, loading } = useHostCallRate(
    preloadedRate !== undefined ? null : hostId
  );
  
  const callRate = preloadedRate !== undefined ? preloadedRate : fetchedRate;

  const formatRate = (rate: number): string => {
    if (rate >= 1000) return `${(rate / 1000).toFixed(rate >= 10000 ? 0 : 1)}K`;
    return rate.toString();
  };

  const sizeClasses = {
    sm: "w-10 h-10",
    md: "w-12 h-12",
    lg: "w-14 h-14",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-5 h-5",
    lg: "w-6 h-6",
  };

  const handleClick = () => {
    onClick();
  };

  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className={`${sizeClasses[size]} rounded-full bg-gradient-to-r from-orange-400 via-pink-500 to-purple-500 text-white shadow-lg shadow-pink-500/40 flex items-center justify-center relative overflow-hidden`}
      >
        {/* Animated ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-white/30"
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <Phone className={iconSizes[size]} />
      </motion.button>

      {/* Rate Display */}
      {showRate && callRate && callRate > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-0.5 bg-gradient-to-r from-amber-500/90 to-orange-500/90 px-2 py-0.5 rounded-full shadow-lg -mt-2 relative z-10"
        >
          <Diamond className="w-2.5 h-2.5 text-white" />
          <span className="text-[10px] font-bold text-white">
            {preloadedRate !== undefined ? formatRate(callRate) : (loading ? "..." : formatRate(callRate))}
          </span>
          <span className="text-[8px] text-white/80">/min</span>
        </motion.div>
      )}
    </div>
  );
}
