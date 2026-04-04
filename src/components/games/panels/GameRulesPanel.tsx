import { motion } from "framer-motion";
import { X, HelpCircle, Trophy, Coins, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface GameRulesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  gameId: string;
  gameName: string;
}

const GAME_RULES: Record<string, { title: string; rules: string[]; tips: string[]; multipliers: { label: string; value: string }[] }> = {
  'teen-patti': {
    title: 'Teen Patti',
    rules: [
      'Three hands (A, B, C) are dealt with 3 cards each',
      'Select one or more hands to bet on',
      'The hand with the highest score wins',
      'Winners get 2x their bet amount',
      'You can bet on multiple hands in the same round'
    ],
    tips: [
      'Betting on multiple hands increases your chances',
      'Watch the timer - bets close when time runs out',
      'Trail (Three of a kind) is the highest hand'
    ],
    multipliers: [
      { label: 'Win', value: '2x' }
    ]
  },
  'teen_patti': {
    title: 'Teen Patti',
    rules: [
      'Three hands (A, B, C) are dealt with 3 cards each',
      'Select one or more hands to bet on',
      'The hand with the highest score wins',
      'Winners get 2x their bet amount',
      'You can bet on multiple hands in the same round'
    ],
    tips: [
      'Betting on multiple hands increases your chances',
      'Watch the timer - bets close when time runs out',
      'Trail (Three of a kind) is the highest hand'
    ],
    multipliers: [
      { label: 'Win', value: '2x' }
    ]
  },
  'ferris-wheel': {
    title: 'Ferris Wheel',
    rules: [
      'Select one or more food items on the wheel',
      'The wheel spins and lands on a random item',
      'If your selected item wins, you get the multiplier',
      'Higher multipliers have lower probability',
      'You can bet on multiple items'
    ],
    tips: [
      'Items with higher multipliers win less often',
      'Spread your bets for better chances',
      'Watch for patterns in previous rounds'
    ],
    multipliers: [
      { label: 'Grapes/Carrot/Strawberry/Cupcake', value: '5x' },
      { label: 'Apple', value: '10x' },
      { label: 'Fries', value: '15x' },
      { label: 'Burger', value: '25x' },
      { label: 'Pizza', value: '45x' }
    ]
  },
  'ferris_wheel': {
    title: 'Ferris Wheel',
    rules: [
      'Select one or more food items on the wheel',
      'The wheel spins and lands on a random item',
      'If your selected item wins, you get the multiplier',
      'Higher multipliers have lower probability',
      'You can bet on multiple items'
    ],
    tips: [
      'Items with higher multipliers win less often',
      'Spread your bets for better chances',
      'Watch for patterns in previous rounds'
    ],
    multipliers: [
      { label: 'Grapes/Carrot/Strawberry/Cupcake', value: '5x' },
      { label: 'Apple', value: '10x' },
      { label: 'Fries', value: '15x' },
      { label: 'Burger', value: '25x' },
      { label: 'Pizza', value: '45x' }
    ]
  },
  'roulette': {
    title: 'Roulette',
    rules: [
      'Place bets on colors, numbers, or ranges',
      'The wheel spins and the ball lands on a number',
      'Red/Black, Even/Odd, Low/High pay 2x',
      'Single number bets pay 36x',
      'Green (0) loses for all color/range bets'
    ],
    tips: [
      'Color bets are safest with 2x payout',
      'Single numbers have highest risk but 36x reward',
      'Avoid betting when timer is low'
    ],
    multipliers: [
      { label: 'Red/Black', value: '2x' },
      { label: 'Even/Odd', value: '2x' },
      { label: 'Low (1-18)/High (19-36)', value: '2x' },
      { label: 'Single Number', value: '36x' }
    ]
  }
};

export function GameRulesPanel({ isOpen, onClose, gameId, gameName }: GameRulesPanelProps) {
  if (!isOpen) return null;

  const rules = GAME_RULES[gameId] || {
    title: gameName,
    rules: ['Place your bet before the timer ends', 'Winners receive multiplied rewards'],
    tips: ['Start with small bets to learn the game'],
    multipliers: [{ label: 'Win', value: '2x' }]
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 rounded-2xl border border-purple-500/30 overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-white font-bold">{rules.title} Rules</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10 w-8 h-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <ScrollArea className="max-h-[60vh]">
          <div className="p-4 space-y-4">
            {/* Rules */}
            <div className="space-y-2">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Target className="w-4 h-4 text-blue-400" />
                How to Play
              </h3>
              <ul className="space-y-1.5">
                {rules.rules.map((rule, i) => (
                  <li key={i} className="text-white/70 text-xs flex items-start gap-2">
                    <span className="text-purple-400 mt-0.5">•</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>

            {/* Multipliers */}
            <div className="space-y-2">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Coins className="w-4 h-4 text-amber-400" />
                Payouts
              </h3>
              <div className="grid gap-1.5">
                {rules.multipliers.map((m, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                    <span className="text-white/70 text-xs">{m.label}</span>
                    <span className="text-amber-400 font-bold text-xs">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="space-y-2">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2">
                <Trophy className="w-4 h-4 text-green-400" />
                Pro Tips
              </h3>
              <ul className="space-y-1.5">
                {rules.tips.map((tip, i) => (
                  <li key={i} className="text-white/70 text-xs flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">💡</span>
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </motion.div>
    </motion.div>
  );
}
