import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useMotionValue, animate } from "framer-motion";
import { PhoneCall, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Chamet-style draggable, dismissible 3D "Random Chat" mini pill.
 * - Compact size (~52x52 with label)
 * - Drag anywhere on screen; snaps to nearest edge
 * - Close button hides for the session
 * - 3D glass + glow polish
 */
const STORAGE_POS = "random_pill_pos_v2";
const STORAGE_DISMISSED = "random_pill_dismissed_v2";

export default function FloatingRandomMatchPill({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const [avatar, setAvatar] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Load avatar sample (RLS-safe RPC)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc("get_random_pool_sample" as any, { _limit: 4 });
        if (!cancelled) {
          const url = ((data as any[] | null) ?? []).map((r) => r?.avatar_url).find(Boolean);
          if (url) setAvatar(url as string);
        }
      } catch (_) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

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
        // default: left edge, ~28% down
        x.set(0);
        y.set(Math.round(window.innerHeight * 0.28));
      }
    } catch (_) {}
    setMounted(true);
  }, [x, y]);

  if (dismissed || !mounted) return null;

  const PILL_W = 132;
  const PILL_H = 52;
  const MARGIN = 8;

  const handleDragEnd = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const curX = x.get();
    const curY = y.get();
    // Snap horizontally to nearest edge
    const targetX = curX + PILL_W / 2 < vw / 2 ? MARGIN : vw - PILL_W - MARGIN;
    const targetY = Math.max(80, Math.min(vh - PILL_H - 100, curY));
    animate(x, targetX, { type: "spring", stiffness: 380, damping: 32 });
    animate(y, targetY, { type: "spring", stiffness: 380, damping: 32 });
    try {
      localStorage.setItem(STORAGE_POS, JSON.stringify({ x: targetX, y: targetY }));
    } catch (_) {}
  };

  return (
    <motion.div
      ref={containerRef}
      drag
      dragMomentum={false}
      dragElastic={0.08}
      dragConstraints={{
        left: 0,
        right: typeof window !== "undefined" ? window.innerWidth - PILL_W : 320,
        top: 60,
        bottom: typeof window !== "undefined" ? window.innerHeight - PILL_H - 90 : 600,
      }}
      onDragEnd={handleDragEnd}
      style={{ x, y }}
      className={`fixed left-0 top-0 z-40 touch-none select-none ${className}`}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
    >
      <div className="relative" style={{ width: PILL_W, height: PILL_H }}>
        {/* Close button */}
        <button
          aria-label="Hide Random Chat"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            try { sessionStorage.setItem(STORAGE_DISMISSED, "1"); } catch (_) {}
            setDismissed(true);
          }}
          className="absolute -top-1.5 -right-1.5 z-20 w-5 h-5 rounded-full bg-black/75 text-white grid place-items-center shadow-lg ring-1 ring-white/30 backdrop-blur-sm active:scale-90 transition-transform"
        >
          <X className="w-3 h-3" strokeWidth={3} />
        </button>

        {/* Main pill — 3D */}
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => navigate("/match-call")}
          aria-label="Open Random Match"
          className="group relative w-full h-full rounded-full overflow-hidden
            bg-gradient-to-br from-fuchsia-500 via-purple-500 to-pink-500
            shadow-[0_10px_24px_-6px_rgba(168,85,247,0.55),0_4px_10px_-3px_rgba(236,72,153,0.5),inset_0_1px_0_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.18)]
            ring-1 ring-white/25 active:scale-[0.96] transition-transform"
        >
          {/* Top sheen (3D) */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-full bg-gradient-to-b from-white/35 via-white/10 to-transparent" />
          {/* Pulsing aura */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full bg-pink-400/20 blur-md animate-pulse" />

          <div className="relative flex items-center gap-2 pl-1 pr-3 h-full">
            {/* Avatar with phone overlay */}
            <span className="relative shrink-0">
              {avatar ? (
                <img src={avatar} alt="" className="w-[42px] h-[42px] rounded-full object-cover border-2 border-white/90 shadow-md" />
              ) : (
                <span className="w-[42px] h-[42px] rounded-full border-2 border-white/90 bg-gradient-to-br from-fuchsia-200 to-pink-300 grid place-items-center text-[12px] font-extrabold text-fuchsia-700 shadow-md">
                  F
                </span>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 border-[1.5px] border-white grid place-items-center shadow">
                <PhoneCall className="w-2.5 h-2.5 text-white" strokeWidth={3} />
              </span>
            </span>

            {/* Label */}
            <span className="relative flex flex-col items-start leading-tight text-white">
              <span className="text-[11px] font-extrabold tracking-tight drop-shadow-[0_1px_1px_rgba(0,0,0,0.25)]">
                Random
              </span>
              <span className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/95">
                FREE
              </span>
            </span>
          </div>
        </button>
      </div>
    </motion.div>
  );
}
