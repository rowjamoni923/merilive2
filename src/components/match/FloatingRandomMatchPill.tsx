import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, animate } from "framer-motion";
import { Shuffle, X } from "lucide-react";

/**
 * Chamet-style draggable, dismissible 3D "Random Chat" mini pill.
 * Stable hook order — never early-returns mid-render.
 */
const STORAGE_POS = "random_pill_pos_v4";
const STORAGE_DISMISSED = "random_pill_dismissed_v4";
const PILL_W = 150;
const PILL_H = 44;
const MARGIN = 8;

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try { return sessionStorage.getItem(STORAGE_DISMISSED) === "1"; } catch { return false; }
}
function readPos(): { x: number; y: number } {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(STORAGE_POS);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.x === "number" && typeof p?.y === "number") return p;
    }
  } catch {}
  return { x: 0, y: Math.round((window.innerHeight || 800) * 0.32) };
}

export default function FloatingRandomMatchPill({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed());
  const draggedRef = useRef(false);
  const initial = useRef(readPos()).current;
  const x = useMotionValue(initial.x);
  const y = useMotionValue(initial.y);

  useEffect(() => {
    // no-op; pos already initialised
  }, []);

  const handleDragEnd = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const curX = x.get();
    const curY = y.get();
    const targetX = curX + PILL_W / 2 < vw / 2 ? MARGIN : vw - PILL_W - MARGIN;
    const targetY = Math.max(80, Math.min(vh - PILL_H - 100, curY));
    animate(x, targetX, { type: "spring", stiffness: 380, damping: 32 });
    animate(y, targetY, { type: "spring", stiffness: 380, damping: 32 });
    try { localStorage.setItem(STORAGE_POS, JSON.stringify({ x: targetX, y: targetY })); } catch {}
  };

  if (dismissed) return null;

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={{
        left: 0,
        right: typeof window !== "undefined" ? window.innerWidth - PILL_W : 320,
        top: 60,
        bottom: typeof window !== "undefined" ? window.innerHeight - PILL_H - 90 : 600,
      }}
      onDragStart={() => { draggedRef.current = true; }}
      onDragEnd={() => { handleDragEnd(); setTimeout(() => { draggedRef.current = false; }, 150); }}
      style={{ x, y }}
      className={`fixed left-0 top-0 z-40 touch-none select-none ${className}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
    >
      <div className="relative" style={{ width: PILL_W, height: PILL_H }}>
        {/* Tiny pro dismiss dot */}
        <button
          aria-label="Hide Random Chat"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            try { sessionStorage.setItem(STORAGE_DISMISSED, "1"); } catch {}
            setDismissed(true);
          }}
          style={{
            width: 16, height: 16, minWidth: 16, minHeight: 16,
          }}
          className="absolute z-20 rounded-full bg-black/60 text-white grid place-items-center
                     ring-[0.5px] ring-white/35 shadow-[0_1px_2px_rgba(0,0,0,0.4)]
                     backdrop-blur-sm active:scale-90 transition-transform"
        >
          <X style={{ width: 9, height: 9 }} strokeWidth={2.8} />
        </button>

        {/* Main pill — rectangular, icon + label */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            if (draggedRef.current) return;
            navigate("/match-call?instant=1");
          }}
          aria-label="Start Random Chat"
          className="group relative w-full h-full rounded-full overflow-hidden
            bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500
            shadow-[0_8px_20px_-6px_rgba(168,85,247,0.55),0_3px_8px_-3px_rgba(236,72,153,0.5),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.18)]
            ring-1 ring-white/30 active:scale-[0.96] transition-transform
            flex items-center gap-2 pl-2 pr-4"
        >
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/35 via-white/10 to-transparent" />
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-pink-400/20 blur-md animate-pulse" />
          <span className="relative grid place-items-center rounded-full bg-white/20 ring-1 ring-white/40" style={{ width: 30, height: 30 }}>
            <Shuffle className="w-4 h-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]" strokeWidth={2.8} />
          </span>
          <span className="relative text-white font-semibold text-[13px] tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)] whitespace-nowrap">
            Random Chat
          </span>
        </button>
      </div>
    </motion.div>
  );
}
