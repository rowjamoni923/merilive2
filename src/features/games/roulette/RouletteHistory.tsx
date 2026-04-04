import { motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface RouletteHistoryProps {
  results: number[];
  onClose: () => void;
}

const RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];

export const RouletteHistory = ({ results, onClose }: RouletteHistoryProps) => {
  const getNumberColor = (num: number): "red" | "black" | "green" => {
    if (num === 0) return "green";
    return RED_NUMBERS.includes(num) ? "red" : "black";
  };

  // Stats
  const redCount = results.filter(n => RED_NUMBERS.includes(n)).length;
  const blackCount = results.filter(n => n > 0 && !RED_NUMBERS.includes(n)).length;
  const greenCount = results.filter(n => n === 0).length;
  const oddCount = results.filter(n => n > 0 && n % 2 === 1).length;
  const evenCount = results.filter(n => n > 0 && n % 2 === 0).length;

  return (
    <motion.div
      initial={{ x: "-100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-100%" }}
      className="fixed inset-y-0 left-0 w-80 bg-gradient-to-br from-gray-900 to-gray-800 z-50 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h2 className="text-white font-bold text-lg">History</h2>
        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Stats */}
      <div className="p-4 border-b border-white/10">
        <h3 className="text-white/70 text-sm mb-3">Last {results.length} Spins</h3>
        
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-red-600/20 rounded-lg p-2 text-center">
            <div className="text-red-400 font-bold text-xl">{redCount}</div>
            <div className="text-white/50 text-xs">Red</div>
          </div>
          <div className="bg-gray-600/20 rounded-lg p-2 text-center">
            <div className="text-gray-300 font-bold text-xl">{blackCount}</div>
            <div className="text-white/50 text-xs">Black</div>
          </div>
          <div className="bg-green-600/20 rounded-lg p-2 text-center">
            <div className="text-green-400 font-bold text-xl">{greenCount}</div>
            <div className="text-white/50 text-xs">Zero</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-white font-bold">{oddCount}</div>
            <div className="text-white/50 text-xs">Odd</div>
          </div>
          <div className="bg-white/5 rounded-lg p-2 text-center">
            <div className="text-white font-bold">{evenCount}</div>
            <div className="text-white/50 text-xs">Even</div>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="p-4">
        <h3 className="text-white/70 text-sm mb-3">All Results</h3>
        <div className="grid grid-cols-5 gap-2">
          {results.map((num, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.02 }}
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm",
                getNumberColor(num) === "red" && "bg-red-600",
                getNumberColor(num) === "black" && "bg-gray-800",
                getNumberColor(num) === "green" && "bg-green-600"
              )}
            >
              {num}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
