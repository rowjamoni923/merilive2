import { motion } from "framer-motion";
import { X, HelpCircle, Trophy, Coins, Target } from "lucide-react";
import { useMobileOrientation } from "@/hooks/useMobileOrientation";
import { cn } from "@/lib/utils";

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
  const { isLandscape, isVerySmallHeight } = useMobileOrientation();
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
        className={cn(
          "w-full bg-gradient-to-br from-slate-900 via-purple-900/90 to-slate-900 rounded-2xl border border-purple-500/30 overflow-hidden shadow-2xl",
          isLandscape ? "max-w-xl max-h-[95dvh]" : "max-w-sm"
        )}
      >

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 bg-black/40 backdrop-blur-sm">
          <div className="flex items-center gap-2.5">
            <motion.div
              whileHover={{ rotate: -6, scale: 1.05 }}
              className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
              style={{
                background: 'radial-gradient(120% 120% at 30% 20%, #d8b4fe 0%, #a855f7 45%, #6b21a8 100%)',
                boxShadow: '0 8px 18px -6px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.3)'
              }}
            >
              <HelpCircle className="w-4 h-4 text-white relative drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" />
              <div className="absolute inset-x-1.5 top-1 h-1.5 rounded-full bg-white/40 blur-[2px]" />
            </motion.div>
            <h2 className="text-white font-extrabold tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">{rules.title} Rules</h2>
          </div>
          <motion.button
            whileHover={{ scale: 1.08, rotate: 90 }}
            whileTap={{ scale: 0.92 }}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 text-white flex items-center justify-center border border-white/10"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)' }}
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>

        <ScrollArea 
          className="relative"
          style={{ 
            height: isVerySmallHeight ? '180px' : isLandscape ? '250px' : '60vh',
            minHeight: '150px'
          }}
        >

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
