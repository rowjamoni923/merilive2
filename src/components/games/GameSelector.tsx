import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { GlobalGameOverlay } from "./GlobalGameOverlay";

interface GameSelectorProps {
  onSelectGame?: (gameId: string) => void;
}

const games = [
  { id: 'lucky28', name: 'Lucky 28', emoji: '🎲', color: 'from-purple-500 via-fuchsia-500 to-pink-500' },
  { id: 'lucky28pro', name: 'Lucky 28-Pro', emoji: '🎰', color: 'from-indigo-600 via-purple-600 to-fuchsia-600' },
  { id: 'race', name: 'Chamet Race', emoji: '🏁', color: 'from-orange-500 via-red-500 to-rose-600' },
  { id: 'apple', name: 'Apple Master', emoji: '🍎', color: 'from-red-500 via-rose-500 to-pink-500' },
  { id: 'wheel', name: 'Top Wheel', emoji: '🎡', color: 'from-pink-500 via-fuchsia-500 to-purple-500' },
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
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-2xl border-2 border-white/30 hover:-translate-y-1 active:translate-y-0 transition-transform p-0 overflow-hidden"
            style={{
              background:
                'radial-gradient(120% 120% at 30% 20%, #c084fc 0%, #a855f7 40%, #ec4899 100%)',
              boxShadow:
                '0 12px 28px -8px rgba(168,85,247,0.65), 0 6px 14px -4px rgba(236,72,153,0.5), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.25)',
            }}
            aria-label="Open games"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                background:
                  'radial-gradient(60% 40% at 50% 18%, rgba(255,255,255,0.55), transparent 70%)',
              }}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/2 rotate-12 animate-[giftSendShine_3s_ease-in-out_infinite]"
              style={{
                background:
                  'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
              }}
            />
            <span
              className="text-2xl relative"
              style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}
            >
              🎮
            </span>
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-auto rounded-t-3xl border-0 p-0"
          style={{
            background:
              'radial-gradient(120% 80% at 50% 0%, rgba(168,85,247,0.18), transparent 55%), linear-gradient(180deg, #FFFBF2 0%, #FAF5EA 60%, #F5EFDF 100%)',
            boxShadow:
              '0 -18px 60px -10px rgba(168,85,247,0.3), 0 -4px 24px rgba(0,0,0,0.15)',
          }}
        >
          <div className="flex justify-center pt-3">
            <div className="w-12 h-1.5 rounded-full bg-gradient-to-r from-transparent via-amber-900/30 to-transparent" />
          </div>

          <div className="px-6 pt-3 pb-1">
            <h3
              className="text-base font-extrabold text-amber-900 tracking-wide"
              style={{ textShadow: '0 1px 0 rgba(255,255,255,0.6)' }}
            >
              Pick a Game
            </h3>
            <p className="text-[11px] text-amber-900/65 font-medium">
              Play live and win diamonds
            </p>
          </div>

          <div className="p-6 grid grid-cols-4 gap-4">
            {games.map((game) => (
              <motion.button
                key={game.id}
                whileHover={{ scale: 1.05, y: -3 }}
                whileTap={{ scale: 0.94, y: 0 }}
                onClick={() => handleSelectGame(game.id)}
                className="flex flex-col items-center gap-2"
              >
                <div
                  className={cn(
                    "relative w-16 h-16 rounded-2xl flex items-center justify-center text-3xl overflow-hidden border-2 border-white/40",
                    `bg-gradient-to-br ${game.color}`
                  )}
                  style={{
                    boxShadow:
                      '0 12px 24px -8px rgba(0,0,0,0.35), 0 4px 10px -2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.22)',
                  }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{
                      background:
                        'radial-gradient(60% 40% at 50% 18%, rgba(255,255,255,0.5), transparent 70%)',
                    }}
                  />
                  <span
                    className="relative"
                    style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}
                  >
                    {game.emoji}
                  </span>
                </div>
                <span className="text-[11px] font-bold text-amber-900 text-center leading-tight">
                  {game.name}
                </span>
              </motion.button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

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
