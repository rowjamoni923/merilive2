import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { GlobalGameOverlay } from "./GlobalGameOverlay";

interface GameSelectorProps {
  onSelectGame?: (gameId: string) => void;
}

const games = [
  { id: 'lucky28', name: 'Lucky 28', emoji: '🎲', color: 'from-purple-500 to-pink-500' },
  { id: 'lucky28pro', name: 'Lucky 28-Pro', emoji: '🎰', color: 'from-purple-600 to-indigo-600' },
  { id: 'race', name: 'Chamet Race', emoji: '🏁', color: 'from-orange-500 to-red-500' },
  { id: 'apple', name: 'Apple Master', emoji: '🍎', color: 'from-red-500 to-pink-500' },
  { id: 'wheel', name: 'Top Wheel', emoji: '🎡', color: 'from-pink-500 to-purple-500' },
];

export function GameSelector({ onSelectGame }: GameSelectorProps) {
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectGame = (gameId: string) => {
    setSelectedGame(gameId);
    setIsOpen(false);
    onSelectGame?.(gameId);
  };

  return (
    <>
      {/* Game Selection Sheet */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 shadow-xl border-2 border-white/20 hover:scale-105 transition-transform"
          >
            <span className="text-2xl">🎮</span>
          </Button>
        </SheetTrigger>
        <SheetContent 
          side="bottom" 
          className="h-auto rounded-t-3xl bg-gradient-to-b from-pink-50 to-white border-0 p-0"
        >
          {/* Handle */}
          <div className="flex justify-center pt-3">
            <div className="w-12 h-1 bg-gray-300 rounded-full" />
          </div>

          {/* Games Grid */}
          <div className="p-6 grid grid-cols-4 gap-4">
            {games.map((game) => (
              <motion.button
                key={game.id}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleSelectGame(game.id)}
                className="flex flex-col items-center gap-2"
              >
                <div className={cn(
                  "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl shadow-lg",
                  `bg-gradient-to-br ${game.color}`
                )}>
                  {game.emoji}
                </div>
                <span className="text-xs font-medium text-gray-700 text-center">
                  {game.name}
                </span>
              </motion.button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Show Game Overlay when selected */}
      <AnimatePresence>
        {selectedGame && (
          <GlobalGameOverlay 
            gameId={selectedGame}
            onClose={() => setSelectedGame(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
