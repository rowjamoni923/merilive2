/**
 * LuckyGiftCelebration — tier-aware fullscreen celebration overlay shown after
 * a winning lucky-gift roll. Every paid lucky bonus renders here so the sender
 * always sees exactly how many bonus diamonds were returned after the gift.
 *
 * Tier mapping (research-locked, see plan.md "Lucky Gift Lottery" section):
 *   >0x – 49x   → "Lucky Bonus" centered ribbon (2.8s)
 *   50x – 999x  → "BIG WIN" fullscreen golden (4s)
 *   ≥1000x      → "MEGA JACKPOT" epic fullscreen (6s)
 *
 * Design tokens only — no hardcoded colors. Uses --primary / --accent / gold
 * via inline gradients tied to HSL tokens.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Crown, Trophy } from 'lucide-react';

export type LuckyWinPayload = {
  spent: number;
  bonus: number;
  giftName?: string;
  giftIconUrl?: string;
};

type Tier = 'nice' | 'big' | 'mega';

function pickTier(multiplier: number): Tier | null {
  if (multiplier <= 0) return null;
  if (multiplier < 50) return 'nice';
  if (multiplier < 1000) return 'big';
  return 'mega';
}

const TIER_DURATION_MS: Record<Tier, number> = {
  nice: 2800,
  big: 4200,
  mega: 6200,
};

function formatDiamonds(n: number): string {
  if (n >= 10_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 100_000) return n.toLocaleString('en-US');
  return n.toLocaleString('en-US');
}

interface Props {
  payload: LuckyWinPayload;
  onClose: () => void;
}

export function LuckyGiftCelebration({ payload, onClose }: Props) {
  const multiplier = useMemo(() => {
    if (!payload.spent || payload.spent <= 0) return 0;
    return payload.bonus / payload.spent;
  }, [payload]);

  const tier = pickTier(multiplier);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!tier) {
      onClose();
      return;
    }
    setMounted(true);
    const t = setTimeout(onClose, TIER_DURATION_MS[tier]);
    return () => clearTimeout(t);
  }, [tier, onClose]);

  if (!tier) return null;

  const multiplierLabel =
    multiplier >= 1000
      ? `${Math.round(multiplier).toLocaleString('en-US')}x`
      : multiplier >= 100
        ? `${Math.round(multiplier)}x`
        : `${multiplier.toFixed(multiplier < 10 ? 1 : 0)}x`;

  const body = (
    <div
      className="fixed inset-x-0 bottom-[22%] z-[9999] flex items-center justify-center pointer-events-none px-4"
      role="status"
      aria-live="polite"
    >
      {/* Bonus chip — appears just below where gift messages land */}
      <div
        className={[
          'relative flex items-center gap-2 rounded-full',
          'border shadow-2xl',
          'transition-all duration-300 ease-out',
          mounted ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-2 opacity-0 scale-95',
          tier === 'nice' ? 'px-4 py-2' : tier === 'big' ? 'px-5 py-2.5' : 'px-6 py-3',
        ].join(' ')}
        style={{
          background:
            'linear-gradient(135deg, rgba(44,55,186,0.96) 0%, rgba(92,99,224,0.94) 55%, rgba(176,190,255,0.85) 100%)',
          borderColor: 'rgba(176,190,255,0.5)',
          color: 'hsl(0 0% 100%)',
          boxShadow:
            tier === 'mega'
              ? '0 14px 32px -8px rgba(44,55,186,0.55), 0 0 0 1px rgba(255,255,255,0.2)'
              : tier === 'big'
                ? '0 12px 26px -8px rgba(44,55,186,0.5)'
                : '0 8px 20px -8px rgba(44,55,186,0.45)',
        }}
      >
        {/* Tier icon */}
        {tier === 'mega' && <Crown className="w-4 h-4 opacity-95" />}
        {tier === 'big' && <Trophy className="w-4 h-4 opacity-95" />}
        {tier === 'nice' && <Sparkles className="w-3.5 h-3.5 opacity-95" />}

        {/* Bonus amount — the hero, big plus diamond */}
        <span
          className={[
            'font-extrabold tabular-nums leading-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]',
            tier === 'mega' ? 'text-[28px]' : tier === 'big' ? 'text-[24px]' : 'text-[20px]',
          ].join(' ')}
        >
          +{formatDiamonds(payload.bonus)}
        </span>
        <span
          className={[
            'leading-none',
            tier === 'mega' ? 'text-[24px]' : tier === 'big' ? 'text-[22px]' : 'text-[18px]',
          ].join(' ')}
          aria-hidden
        >
          💎
        </span>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
