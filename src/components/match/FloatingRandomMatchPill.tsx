import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, animate } from "framer-motion";
import { Shuffle, X } from "lucide-react";

/**
 * Chamet-style draggable, dismissible 3D "Random Chat" mini pill.
 * - Icon-only (no avatar photos) — universal & privacy-safe
 * - Tap → instantly broadcasts random call to every online verified host
 * - Drag anywhere; snaps to nearest edge; close hides for the session
 */
const STORAGE_POS = "random_pill_pos_v3";
const STORAGE_DISMISSED = "random_pill_dismissed_v3";

export default function FloatingRandomMatchPill({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Restore dismissed + position
  useEffect(() => {
    try {
      const d = sessionStorage.getItem(STORAGE_DISMISSED);
      if (d === "1") { setDismissed(true); return; }
      const raw = localStorage.getItem(STORAGE_POS);
      if (raw) {
        const { x: sx, y: sy } = JSON.parse(raw);
        if (typeof sx === "number") x.set(sx);
        if (typeof sy === "number") y.set(sy);
      } else {
        x.set(0);
        y.set(Math.round(window.innerHeight * 0.32));
      }
    } catch (_) {}
    setMounted(true);
  }, [x, y]);

  if (dismissed || !mounted) return null;

  const PILL_SIZE = 56;
  const MARGIN = 8;

  const handleDragEnd = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const curX = x.get();
    const curY = y.get();
    const targetX = curX + PILL_SIZE / 2 < vw / 2 ? MARGIN : vw - PILL_SIZE - MARGIN;
    const targetY = Math.max(80, Math.min(vh - PILL_SIZE - 100, curY));
    animate(x, targetX, { type: "spring", stiffness: 380, damping: 32 });
    animate(y, targetY, { type: "spring", stiffness: 380, damping: 32 });
    try { localStorage.setItem(STORAGE_POS, JSON.stringify({ x: targetX, y: targetY })); } catch (_) {}
  };

  const draggedRef = useRef(false);

  return (
    <motion.div
      ref={containerRef}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={{
        left: 0,
        right: typeof window !== "undefined" ? window.innerWidth - PILL_SIZE : 320,
        top: 60,
        bottom: typeof window !== "undefined" ? window.innerHeight - PILL_SIZE - 90 : 600,
      }}
      onDragStart={() => { draggedRef.current = true; }}
      onDragEnd={() => { handleDragEnd(); setTimeout(() => { draggedRef.current = false; }, 150); }}
      style={{ x, y }}
      className={`fixed left-0 top-0 z-40 touch-none select-none ${className}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
    >
      <div className="relative" style={{ width: PILL_SIZE, height: PILL_SIZE }}>
        {/* Close button */}
        <button
          aria-label="Hide Random Chat"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            try { sessionStorage.setItem(STORAGE_DISMISSED, "1"); } catch (_) {}
            setDismissed(true);
          }}
          className="absolute -top-1 -right-1 z-20 w-5 h-5 rounded-full bg-black/80 text-white grid place-items-center shadow-lg ring-1 ring-white/30 backdrop-blur-sm active:scale-90 transition-transform"
        >
          <X className="w-3 h-3" strokeWidth={3} />
        </button>

        {/* Main pill — 3D icon-only */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (draggedRef.current) return;
            navigate("/match-call?instant=1");
          }}
          aria-label="Start Random Match"
          className="group relative w-full h-full rounded-full overflow-hidden
            bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500
            shadow-[0_10px_24px_-6px_rgba(168,85,247,0.55),0_4px_10px_-3px_rgba(236,72,153,0.5),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.18)]
            ring-1 ring-white/30 active:scale-[0.94] transition-transform"
        >
          {/* Top sheen (3D) */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/40 via-white/10 to-transparent" />
          {/* Pulsing aura */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-pink-400/25 blur-md animate-pulse" />
          {/* Outer ring pulse */}
          <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-pink-400/40 animate-ping" />

          {/* Icon */}
          <span className="relative grid place-items-center w-full h-full">
            <Shuffle className="w-6 h-6 text-white drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]" strokeWidth={2.6} />
          </span>
        </button>
      </div>
    </motion.div>
  );
}

