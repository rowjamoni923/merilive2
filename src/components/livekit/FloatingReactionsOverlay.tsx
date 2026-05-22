/**
 * Pkg132 UI: Floating Reactions Overlay
 * --------------------------------------------------------------
 * Renders ephemeral emoji reactions floating up over a live/party/call view.
 * Pure presentation — subscribes to Pkg132 `useReactions(scope, id)`.
 * Pointer-events-none so it never blocks underlying interactions.
 * Each entry auto-expires via the hook's ttl.
 */
import { useMemo } from "react";
import { useReactions, type ReactionScope } from "@/lib/livekitReactions";

interface Props {
  scope: ReactionScope;
  id: string | null | undefined;
  /** Bottom offset in px so reactions clear any sticky bottom bar. Default 96. */
  bottomOffset?: number;
}

/** Stable deterministic random based on string key — avoids re-jitter on re-render. */
function hashFloat(key: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

export function FloatingReactionsOverlay({ scope, id, bottomOffset = 96 }: Props) {
  const reactions = useReactions(scope, id ?? undefined, 3500);

  const items = useMemo(
    () =>
      reactions.map((r) => {
        // Spread x across right 30% of screen (typical "reaction column")
        const xPct = 65 + hashFloat(r.key, 1) * 25;
        const drift = (hashFloat(r.key, 2) - 0.5) * 60; // ±30px lateral drift
        const scale = 0.9 + hashFloat(r.key, 3) * 0.5;
        const duration = 2800 + Math.floor(hashFloat(r.key, 4) * 800);
        return { ...r, xPct, drift, scale, duration };
      }),
    [reactions],
  );

  if (!id) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] overflow-hidden"
      aria-hidden
    >
      <style>{`
        @keyframes lk-reaction-float {
          0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
          15%  { opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translate(var(--lk-drift, 0px), -70vh) scale(var(--lk-scale, 1)); opacity: 0; }
        }
      `}</style>
      {items.map((r) => (
        <span
          key={r.key}
          className="absolute text-3xl select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]"
          style={{
            left: `${r.xPct}%`,
            bottom: `${bottomOffset}px`,
            // CSS vars consumed by keyframes
            ["--lk-drift" as any]: `${r.drift}px`,
            ["--lk-scale" as any]: r.scale,
            animation: `lk-reaction-float ${r.duration}ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards`,
            willChange: "transform, opacity",
          }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

export default FloatingReactionsOverlay;
