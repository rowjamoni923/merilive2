/**
 * LuckyGiftHost — singleton mounted once in App.tsx. Listens for
 * `lucky-gift-win` window events emitted by `GiftingService` and renders the
 * tier-aware `LuckyGiftCelebration` overlay. Queues if multiple wins fire
 * back-to-back (rare).
 */
import { useEffect, useState } from 'react';
import { LuckyGiftCelebration, type LuckyWinPayload } from './LuckyGiftCelebration';

export const LUCKY_WIN_EVENT = 'lucky-gift-win';

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
      setQueue((q) => [...q, detail]);
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
