import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Gem } from "lucide-react";

interface FlyingDiamond {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  amount: number;
}

interface CoinFlyAnimationProps {
  diamonds: FlyingDiamond[];
  onComplete?: (id: number) => void;
}

export const DiamondFlyAnimation = ({ diamonds, onComplete }: CoinFlyAnimationProps) => {
  return (
    <AnimatePresence>
      {diamonds.map((coin) => (
        <motion.div
          key={coin.id}
          className="fixed z-[100] pointer-events-none"
          initial={{ 
            x: coin.startX, 
            y: coin.startY, 
            scale: 1,
            opacity: 1 
          }}
          animate={{ 
            x: coin.endX, 
            y: coin.endY, 
            scale: 0.5,
            opacity: 0.8
          }}
          exit={{ opacity: 0, scale: 0 }}
          transition={{ 
            duration: 0.6, 
            ease: "easeOut",
            type: "spring",
            stiffness: 100
          }}
          onAnimationComplete={() => onComplete?.(coin.id)}
        >
          <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500 to-yellow-400 px-2 py-1 rounded-full shadow-lg shadow-amber-500/50">
            <Gem className="w-4 h-4 text-amber-900" />
            <span className="text-amber-900 font-bold text-xs">{coin.amount.toLocaleString()}</span>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
};

// Hook to manage flying diamonds
export const useFlyingDiamonds = () => {
  const [diamonds, setDiamonds] = useState<FlyingDiamond[]>([]);
  const [nextId, setNextId] = useState(0);

  const addDiamond = (startX: number, startY: number, endX: number, endY: number, amount: number) => {
    const id = nextId;
    setNextId(prev => prev + 1);
    setDiamonds(prev => [...prev, { id, startX, startY, endX, endY, amount }]);
    
    // Auto remove after animation
    setTimeout(() => {
      setDiamonds(prev => prev.filter(c => c.id !== id));
    }, 700);
    
    return id;
  };

  const removeDiamond = (id: number) => {
    setDiamonds(prev => prev.filter(c => c.id !== id));
  };

  return { diamonds, addDiamond, removeDiamond };
};

// Win celebration animation
export const WinCelebration = ({ 
  show, 
  amount, 
  onComplete 
}: { 
  show: boolean; 
  amount: number; 
  onComplete?: () => void 
}) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ duration: 0.5, repeat: 3 }}
            className="relative"
          >
            {/* Celebration background */}
            <div className="absolute inset-0 -m-20 bg-gradient-radial from-green-500/30 via-transparent to-transparent rounded-full" />
            
            {/* Main win display */}
            <div className="bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 rounded-2xl p-6 shadow-2xl shadow-green-500/50 border-2 border-white/30">
              <motion.div
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 0.3, repeat: 5 }}
                className="text-4xl text-center mb-2"
              >
                🎉
              </motion.div>
              <h2 className="text-white font-black text-xl text-center mb-1">YOU WIN!</h2>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.3 }}
                className="flex items-center justify-center gap-2"
              >
                <Gem className="w-6 h-6 text-yellow-300" />
                <span className="text-yellow-300 font-black text-2xl">
                  +{amount.toLocaleString()}
                </span>
              </motion.div>
            </div>

            {/* Confetti effect */}
            {[...Array(12)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ 
                  x: 0, 
                  y: 0, 
                  opacity: 1,
                  rotate: 0
                }}
                animate={{ 
                  x: (Math.random() - 0.5) * 200,
                  y: (Math.random() - 0.5) * 200,
                  opacity: 0,
                  rotate: Math.random() * 360
                }}
                transition={{ 
                  duration: 1.5,
                  delay: i * 0.05
                }}
                className="absolute top-1/2 left-1/2 text-2xl"
              >
                {['🪙', '⭐', '💎', '✨'][i % 4]}
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Loss display animation
export const LossDisplay = ({ 
  show, 
  amount, 
  onComplete 
}: { 
  show: boolean; 
  amount: number; 
  onComplete?: () => void 
}) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(() => {
        onComplete?.();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
        >
          <motion.div
            animate={{ x: [0, -5, 5, -5, 5, 0] }}
            transition={{ duration: 0.4 }}
            className="bg-gradient-to-br from-red-500 via-rose-500 to-red-600 rounded-2xl p-6 shadow-2xl shadow-red-500/50 border-2 border-white/20"
          >
            <motion.div
              animate={{ scale: [1, 0.9, 1] }}
              transition={{ duration: 0.3, repeat: 2 }}
              className="text-4xl text-center mb-2"
            >
              😔
            </motion.div>
            <h2 className="text-white font-black text-xl text-center mb-1">LOST</h2>
            <div className="flex items-center justify-center gap-2">
              <Gem className="w-5 h-5 text-red-200" />
              <span className="text-red-200 font-bold text-lg">
                -{amount.toLocaleString()}
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Diamond stacking on bet area
export const BetAreaDiamonds = ({ 
  amount, 
  maxDiamonds = 5 
}: { 
  amount: number; 
  maxDiamonds?: number 
}) => {
  const diamondCount = Math.min(Math.ceil(amount / 10000), maxDiamonds);
  
  return (
    <div className="relative flex items-end justify-center h-8">
      {[...Array(diamondCount)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: i * 0.1, type: "spring" }}
          className="absolute"
          style={{ 
            bottom: i * 3,
            zIndex: i 
          }}
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 border-2 border-yellow-300 shadow-md flex items-center justify-center">
            <span className="text-[8px] font-bold text-amber-800">🪙</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
};
