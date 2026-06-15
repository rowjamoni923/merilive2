/**
 * LuckyGiftHost — singleton mounted once in App.tsx. Listens for
 * `lucky-gift-win` window events emitted by `GiftingService` and renders the
 * tier-aware `LuckyGiftCelebration` overlay AFTER the flying-gift animation
 * has cleared, so the bonus amount is never hidden behind the gift visual.
 *
 * Delay = FlyingGiftAnimation auto-dismiss (3500ms) + small buffer.
 */
import { useEffect, useState } from 'react';
import { LuckyGiftCelebration, type LuckyWinPayload } from './LuckyGiftCelebration';

export const LUCKY_WIN_EVENT = 'lucky-gift-win';
const FLYING_GIFT_CLEAR_MS = 3600; // FlyingGiftAnimation dismisses at 3500ms

export function emitLuckyWin(payload: LuckyWinPayload) {
  try {
    window.dispatchEvent(new CustomEvent(LUCKY_WIN_EVENT, { detail: payload }));
  } catch {}
}

export default function LuckyGiftHost() {
  const [queue, setQueue] = useState<LuckyWinPayload[]>([]);

  useEffect(() => {
    const onWin = (e: Event) => {
      const detail = (e as CustomEvent<LuckyWinPayload>).detail;
      if (!detail || !detail.bonus || detail.bonus <= 0) return;
      // Defer until after the flying-gift animation finishes so the
      // celebration card is fully readable, not overlapping the gift visual.
      const t = window.setTimeout(() => {
        setQueue((q) => [...q, detail]);
      }, FLYING_GIFT_CLEAR_MS);
      return () => window.clearTimeout(t);
    };
    window.addEventListener(LUCKY_WIN_EVENT, onWin as EventListener);
    return () => window.removeEventListener(LUCKY_WIN_EVENT, onWin as EventListener);
  }, []);

  if (queue.length === 0) return null;

  const current = queue[0];
  return (
    <LuckyGiftCelebration
      key={`${current.spent}-${current.bonus}-${queue.length}`}
      payload={current}
      onClose={() => setQueue((q) => q.slice(1))}
    />
  );
}
