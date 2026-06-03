/**
 * Pkg424 — Pro live-stream viewer count chip.
 * Animates with a smooth count-up over ~500ms (matches Bigo/TikTok/YouTube feel)
 * and renders K/M abbreviations at >=1k / >=1M (single source: formatCompactCount).
 *
 * Stale-state indicator: when `connected === false`, the chip dims to 60%
 * opacity to signal the count may be stale (network blip / LiveKit reconnecting).
 */
import { memo, useEffect, useRef, useState } from "react";
import { formatCompactCount } from "@/utils/formatCount";

interface AnimatedViewerCountProps {
  value: number;
  /** false = LiveKit/realtime is disconnected → dim the chip */
  connected?: boolean;
  className?: string;
  durationMs?: number;
}

export const AnimatedViewerCount = memo(({
  value,
  connected = true,
  className = "text-white text-[10px] font-bold tabular-nums",
  durationMs = 500,
}: AnimatedViewerCountProps) => {
  const [displayed, setDisplayed] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);

  useEffect(() => {
    // Skip animation for tiny deltas (initial mount / no-op)
    if (value === displayed) return;
    fromRef.current = displayed;
    startRef.current = performance.now();
    const target = value;
    const from = fromRef.current;
    const delta = target - from;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / durationMs);
      // easeOutCubic — fast start, gentle settle (premium feel)
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + delta * eased);
      setDisplayed(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayed(target);
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return (
    <span
      className={className}
      style={{ opacity: connected ? 1 : 0.6, transition: "opacity 220ms ease-out" }}
    >
      {formatCompactCount(Math.max(0, displayed))}
    </span>
  );
});

AnimatedViewerCount.displayName = "AnimatedViewerCount";

export default AnimatedViewerCount;
