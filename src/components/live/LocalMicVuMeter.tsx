/**
 * Pkg203 — Local mic VU meter visual (M6).
 *
 * Drop-in indicator. Renders 5 vertical bars that light up based on the
 * local participant's mic level. When `level === 0` (mic muted /
 * unpublished) it shows a muted state.
 *
 * Usage:
 *   <LocalMicVuMeter scope="live" id={streamId} />
 *   <LocalMicVuMeter scope="party" id={roomId} compact />
 *
 * No side-effects beyond a RAF read of `localParticipant.audioLevel`.
 */

import { useMemo } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLocalMicLevel } from '@/lib/livekitLocalAudioLevel';
import type { StreamScope } from '@/lib/livekitStreams';

const BARS = 5;
const COLORS = ['#22c55e', '#22c55e', '#84cc16', '#facc15', '#ef4444'];

export interface LocalMicVuMeterProps {
  scope: StreamScope;
  id: string;
  /** Force muted appearance regardless of measured level. */
  muted?: boolean;
  /** Compact 24px-wide variant (no icon, no padding). */
  compact?: boolean;
  className?: string;
}

export function LocalMicVuMeter({
  scope,
  id,
  muted = false,
  compact = false,
  className,
}: LocalMicVuMeterProps) {
  const level = useLocalMicLevel(scope, id);
  const effective = muted ? 0 : level;
  const activeBars = useMemo(
    () => Math.round(Math.min(1, effective) * BARS),
    [effective],
  );

  const barsEl = (
    <div className="flex items-end gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }).map((_, i) => {
        const isActive = i < activeBars;
        const h = 6 + i * 3;
        return (
          <motion.span
            key={i}
            initial={false}
            animate={{
              opacity: isActive ? 1 : 0.25,
              scaleY: isActive ? 1 : 0.55,
              backgroundColor: isActive ? COLORS[i] : 'rgba(255,255,255,0.35)',
            }}
            transition={{ type: 'spring', damping: 22, stiffness: 360 }}
            style={{
              width: 3,
              height: h,
              borderRadius: 2,
              transformOrigin: 'bottom',
              boxShadow: isActive ? `0 0 6px ${COLORS[i]}88` : 'none',
            }}
          />
        );
      })}
    </div>
  );

  if (compact) {
    return (
      <div
        className={className}
        role="meter"
        aria-label="Microphone level"
        aria-valuenow={Math.round(effective * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {barsEl}
      </div>
    );
  }

  return (
    <div
      className={
        'flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 backdrop-blur-md ' +
        (className ?? '')
      }
      role="meter"
      aria-label="Microphone level"
      aria-valuenow={Math.round(effective * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
      }}
    >
      {muted ? (
        <MicOff className="h-3.5 w-3.5 text-red-400" />
      ) : (
        <Mic className="h-3.5 w-3.5 text-white/85" />
      )}
      {barsEl}
    </div>
  );
}

export default LocalMicVuMeter;
