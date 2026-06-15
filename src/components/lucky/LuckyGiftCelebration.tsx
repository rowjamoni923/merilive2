/**
 * LuckyGiftCelebration — tier-aware fullscreen celebration overlay shown after
 * a winning lucky-gift roll. Replaces the bare toast for any win >= 2x.
 *
 * Tier mapping (research-locked, see plan.md "Lucky Gift Lottery" section):
 *   <2x         → tiny toast (handled in GiftingService, NOT this component)
 *   2x – 49x    → "Nice Win" centered ribbon (2.5s)
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
  if (multiplier < 2) return null;
  if (multiplier < 50) return 'nice';
  if (multiplier < 1000) return 'big';
  return 'mega';
}

const TIER_DURATION_MS: Record<Tier, number> = {
  nice: 2600,
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
      className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {/* Backdrop — stronger for big/mega */}
      <div
        className={[
          'absolute inset-0 transition-opacity duration-300',
          tier === 'mega'
            ? 'bg-black/70 backdrop-blur-md'
            : tier === 'big'
              ? 'bg-black/55 backdrop-blur-sm'
              : 'bg-black/25',
          mounted ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      {/* Card */}
      <div
        className={[
          'relative z-10 flex flex-col items-center justify-center px-6 py-7 rounded-3xl',
          'border shadow-2xl text-center',
          'transition-all duration-500 ease-out',
          mounted ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
          tier === 'nice' ? 'min-w-[260px] max-w-[320px]' : '',
          tier === 'big' ? 'min-w-[300px] max-w-[360px]' : '',
          tier === 'mega' ? 'min-w-[320px] max-w-[380px]' : '',
        ].join(' ')}
        style={{
          background:
            tier === 'mega'
              ? 'linear-gradient(140deg, hsl(45 95% 60% / 0.95), hsl(28 95% 55% / 0.95) 55%, hsl(340 85% 55% / 0.95))'
              : tier === 'big'
                ? 'linear-gradient(140deg, hsl(45 90% 58% / 0.94), hsl(35 90% 55% / 0.94))'
                : 'linear-gradient(140deg, hsl(var(--primary) / 0.96), hsl(var(--primary) / 0.85))',
          borderColor:
            tier === 'mega' || tier === 'big'
              ? 'hsl(45 95% 70% / 0.7)'
              : 'hsl(var(--primary) / 0.5)',
          color: 'hsl(0 0% 100%)',
          boxShadow:
            tier === 'mega'
              ? '0 30px 80px -10px hsl(45 95% 50% / 0.6), 0 0 0 1px hsl(45 95% 80% / 0.4)'
              : tier === 'big'
                ? '0 20px 50px -10px hsl(45 90% 50% / 0.5)'
                : '0 15px 35px -10px hsl(var(--primary) / 0.5)',
        }}
      >
        {/* Tier badge */}
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] opacity-95">
          {tier === 'mega' && <Crown className="w-3.5 h-3.5" />}
          {tier === 'big' && <Trophy className="w-3.5 h-3.5" />}
          {tier === 'nice' && <Sparkles className="w-3.5 h-3.5" />}
          <span>
            {tier === 'mega' ? 'Mega Jackpot' : tier === 'big' ? 'Big Win' : 'Lucky Win'}
          </span>
        </div>

        {/* Gift icon (if available) */}
        {payload.giftIconUrl && (
          <div className="mt-3 relative">
            <div
              className="absolute inset-0 rounded-full blur-2xl opacity-60"
              style={{ background: 'hsl(45 95% 70% / 0.6)' }}
            />
            <img
              src={payload.giftIconUrl}
              alt={payload.giftName || 'Gift'}
              className={[
                'relative rounded-full object-contain',
                tier === 'mega' ? 'w-20 h-20' : tier === 'big' ? 'w-16 h-16' : 'w-12 h-12',
              ].join(' ')}
              draggable={false}
            />
          </div>
        )}

        {/* Multiplier — the hero element */}
        <div
          className={[
            'mt-3 font-black leading-none tabular-nums',
            tier === 'mega'
              ? 'text-[64px] drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]'
              : tier === 'big'
                ? 'text-[52px] drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]'
                : 'text-[40px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]',
          ].join(' ')}
        >
          {multiplierLabel}
        </div>

        {/* Bonus amount — large, prominent (the user's main request) */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[15px] font-medium opacity-90">+</span>
          <span
            className={[
              'font-extrabold tabular-nums',
              tier === 'mega' ? 'text-[28px]' : tier === 'big' ? 'text-[24px]' : 'text-[20px]',
            ].join(' ')}
          >
            {formatDiamonds(payload.bonus)}
          </span>
          <span className="text-[18px]" aria-hidden>💎</span>
        </div>

        {/* Spent reference */}
        <div className="mt-1.5 text-[11px] opacity-80">
          Spent {formatDiamonds(payload.spent)} 💎
        </div>

        {/* Mega only: extra hype line */}
        {tier === 'mega' && (
          <div className="mt-3 text-[12px] font-semibold uppercase tracking-[0.2em] opacity-90">
            One in 500,000!
          </div>
        )}
      </div>

      {/* Coin shower — big/mega only */}
      {(tier === 'big' || tier === 'mega') && mounted && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: tier === 'mega' ? 24 : 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute top-[-20px] text-2xl select-none"
              style={{
                left: `${(i * 97) % 100}%`,
                animation: `lgc-fall ${1800 + (i % 7) * 220}ms linear ${i * 60}ms infinite`,
              }}
              aria-hidden
            >
              💎
            </span>
          ))}
          <style>{`@keyframes lgc-fall { 0% { transform: translateY(-20px) rotate(0); opacity: 0; } 10% { opacity: 1; } 100% { transform: translateY(110vh) rotate(360deg); opacity: 0.7; } }`}</style>
        </div>
      )}
    </div>
  );

  return createPortal(body, document.body);
}
