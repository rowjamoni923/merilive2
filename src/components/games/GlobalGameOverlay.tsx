import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LiveGameBoard } from "@/components/games/LiveGameBoard";
import { GameErrorBoundary } from "@/components/games/GameErrorBoundary";

interface GlobalGameOverlayProps {
  gameId?: string;
  roomId?: string;
  isMinimized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onClose?: () => void;
  onOpenGifts?: () => void;
}

export function GlobalGameOverlay({ 
  gameId = 'aviator',
  roomId,
  isMinimized = false,
  onMinimize,
  onMaximize,
  onClose,
  onOpenGifts
}: GlobalGameOverlayProps) {
  const [showGame, setShowGame] = useState(true);

  // Minimized View
  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="fixed bottom-24 left-4 z-50"
      >
        <Button
          onClick={onMaximize}
          className="h-14 w-14 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 shadow-xl border-2 border-white/30"
        >
          <span className="text-lg">🎮</span>
        </Button>
      </motion.div>
    );
  }

  return (
    <Sheet open={showGame} onOpenChange={(open) => {
      setShowGame(open);
      if (!open && onClose) onClose();
    }}>
      <SheetContent 
        side="bottom" 
        className="h-auto max-h-[85vh] rounded-t-3xl bg-gradient-to-b from-slate-900 via-purple-900 to-slate-900 border-0 p-0 overflow-hidden"
      >
        {/* Close Button */}
        <div className="absolute top-2 right-2 z-50">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowGame(false);
              if (onClose) onClose();
            }}
            className="w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Live Game Board - Same for all locations. Wrapped in GameErrorBoundary
            so a crash inside any game shows a friendly retry card instead of a
            blank Sheet. */}
        <div className="p-2 overflow-y-auto max-h-[80vh]">
          <GameErrorBoundary gameName={gameId}>
            <LiveGameBoard
              selectedGame={gameId}
              roomId={roomId}
              onClose={() => {
                setShowGame(false);
                if (onClose) onClose();
              }}
              onOpenGifts={onOpenGifts}
            />
          </GameErrorBoundary>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Compact button to trigger game overlay
export function GlobalGameButton({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 shadow-xl border-2 border-white/20 flex flex-col items-center justify-center"
    >
      <span className="text-2xl">🎮</span>
      <span className="text-[8px] font-bold text-white mt-0.5">Games</span>
    </motion.button>
  );
}
