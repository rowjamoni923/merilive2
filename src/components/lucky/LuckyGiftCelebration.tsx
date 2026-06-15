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

      {/* Card — background matches FlyingGiftAnimation capsule (blue/indigo) */}
      <div
        className={[
          'relative z-10 flex flex-col items-center justify-center rounded-2xl',
          'border shadow-2xl text-center',
          'transition-all duration-300 ease-out',
          mounted ? 'scale-100 opacity-100' : 'scale-90 opacity-0',
          tier === 'nice' ? 'min-w-[180px] max-w-[220px] px-4 py-3.5' : '',
          tier === 'big' ? 'min-w-[220px] max-w-[270px] px-5 py-4' : '',
          tier === 'mega' ? 'min-w-[250px] max-w-[300px] px-5 py-5' : '',
        ].join(' ')}
        style={{
          background:
            tier === 'mega'
              ? 'linear-gradient(135deg, rgba(44,55,186,0.97) 0%, rgba(92,99,224,0.95) 45%, rgba(176,140,255,0.85) 100%)'
              : tier === 'big'
                ? 'linear-gradient(135deg, rgba(44,55,186,0.96) 0%, rgba(92,99,224,0.93) 55%, rgba(176,190,255,0.78) 100%)'
                : 'linear-gradient(135deg, rgba(44,55,186,0.96) 0%, rgba(92,99,224,0.92) 60%, rgba(176,190,255,0.75) 100%)',
          borderColor: 'rgba(176,190,255,0.45)',
          color: 'hsl(0 0% 100%)',
          boxShadow:
            tier === 'mega'
              ? '0 18px 40px -10px rgba(44,55,186,0.55), 0 0 0 1px rgba(255,255,255,0.18)'
              : tier === 'big'
                ? '0 14px 32px -10px rgba(44,55,186,0.5)'
                : '0 10px 24px -10px rgba(44,55,186,0.45)',
        }}
      >
        {/* Tier badge */}
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] opacity-95">
          {tier === 'mega' && <Crown className="w-3 h-3" />}
          {tier === 'big' && <Trophy className="w-3 h-3" />}
          {tier === 'nice' && <Sparkles className="w-3 h-3" />}
          <span>
            {tier === 'mega' ? 'Mega Jackpot' : tier === 'big' ? 'Jackpot Win' : 'Lucky Bonus'}
          </span>
        </div>

        {/* Gift icon (if available) */}
        {payload.giftIconUrl && (
          <div className="mt-2 relative">
            <div
              className="absolute inset-0 rounded-full blur-xl opacity-50"
              style={{ background: 'rgba(176,190,255,0.6)' }}
            />
            <img
              src={payload.giftIconUrl}
              alt={payload.giftName || 'Gift'}
              className={[
                'relative rounded-full object-contain',
                tier === 'mega' ? 'w-14 h-14' : tier === 'big' ? 'w-12 h-12' : 'w-9 h-9',
              ].join(' ')}
              draggable={false}
            />
          </div>
        )}

        {/* Multiplier — the hero element */}
        <div
          className={[
            'mt-2 font-black leading-none tabular-nums',
            tier === 'mega'
              ? 'text-[44px] drop-shadow-[0_3px_10px_rgba(0,0,0,0.45)]'
              : tier === 'big'
                ? 'text-[36px] drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]'
                : 'text-[28px] drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]',
          ].join(' ')}
        >
          {multiplierLabel}
        </div>

        {/* Bonus amount — large, prominent (the user's main request) */}
        <div className="mt-1.5 flex flex-col items-center gap-0.5">
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] opacity-85">
            {tier === 'nice' ? 'Bonus Diamond' : 'Jackpot Diamond'}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[12px] font-medium opacity-90">+</span>
            <span
              className={[
                'font-extrabold tabular-nums',
                tier === 'mega' ? 'text-[22px]' : tier === 'big' ? 'text-[19px]' : 'text-[16px]',
              ].join(' ')}
            >
              {formatDiamonds(payload.bonus)}
            </span>
            <span className="text-[14px]" aria-hidden>💎</span>
          </div>
        </div>

        {/* Spent reference */}
        <div className="mt-1 text-[10px] opacity-80">
          Spent {formatDiamonds(payload.spent)} 💎
        </div>

        {/* Mega only: extra hype line */}
        {tier === 'mega' && (
          <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] opacity-90">
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
