import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { useRandomCallIncoming } from "@/hooks/useRandomCallIncoming";

/**
 * Global host-side ringer for random (broadcast) calls.
 * Mounted once inside CallProvider so every host receives the ring
 * regardless of which page they're on.
 *
 * UI mirrors the standard IncomingCallModal pattern: full-screen overlay,
 * caller avatar/name, accept (green) / decline (red), plus a "Random Match"
 * badge so hosts know this is the random-call pipeline (free first minute,
 * auto-converts to private at 60s).
 */
export default function IncomingRandomCallScreen() {
  const { incoming, accept, reject, accepting } = useRandomCallIncoming();
  const [ringSec, setRingSec] = useState(0);

  useEffect(() => {
    if (!incoming) { setRingSec(0); return; }
    setRingSec(0);
    const id = window.setInterval(() => setRingSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [incoming?.broadcastId]);

  if (typeof document === "undefined") return null;

  const node = (
    <AnimatePresence>
      {incoming && (
        <motion.div
          key={incoming.broadcastId}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[120] flex flex-col items-center justify-between
            bg-gradient-to-b from-fuchsia-900 via-purple-900 to-slate-950
            pt-[max(env(safe-area-inset-top),28px)] pb-[max(env(safe-area-inset-bottom),24px)] px-6"
        >
          {/* Top badge */}
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
              bg-white/12 border border-white/20 backdrop-blur-md"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-white">
              Random Match · First minute free
            </span>
          </motion.div>

          {/* Caller avatar + name */}
          <div className="flex-1 flex flex-col items-center justify-center gap-5">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative"
            >
              {/* Pulsing rings */}
              <motion.span
                className="absolute inset-0 rounded-full bg-fuchsia-400/30"
                animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                className="absolute inset-0 rounded-full bg-purple-400/30"
                animate={{ scale: [1, 1.9, 1], opacity: [0.4, 0, 0.4] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut", delay: 0.4 }}
              />
              {incoming.callerAvatar ? (
                <img
                  src={incoming.callerAvatar}
                  alt=""
                  className="relative w-36 h-36 rounded-full object-cover ring-4 ring-white/40 shadow-2xl"
                />
              ) : (
                <div className="relative w-36 h-36 rounded-full bg-white/15 ring-4 ring-white/40 shadow-2xl
                  grid place-items-center text-5xl text-white/90 font-bold">
                  {(incoming.callerName ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
            </motion.div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white drop-shadow">
                {incoming.callerName ?? "Random Caller"}
              </div>
              <div className="text-sm text-white/75 mt-1">
                Incoming random video call · {ringSec}s
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="w-full flex items-center justify-around max-w-xs">
            <button
              onClick={reject}
              aria-label="Decline"
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <span className="w-16 h-16 rounded-full bg-rose-500 grid place-items-center
                shadow-[0_8px_24px_-4px_rgba(244,63,94,0.6)] ring-2 ring-white/20">
                <PhoneOff className="w-7 h-7 text-white" />
              </span>
              <span className="text-[11px] font-semibold text-white/85 uppercase tracking-wide">
                Decline
              </span>
            </button>
            <button
              onClick={accept}
              disabled={accepting}
              aria-label="Accept"
              className="flex flex-col items-center gap-2 active:scale-95 transition-transform disabled:opacity-60"
            >
              <motion.span
                animate={{ scale: accepting ? 1 : [1, 1.08, 1] }}
                transition={{ duration: 1.2, repeat: accepting ? 0 : Infinity }}
                className="w-16 h-16 rounded-full bg-emerald-500 grid place-items-center
                  shadow-[0_8px_24px_-4px_rgba(16,185,129,0.6)] ring-2 ring-white/20"
              >
                <Phone className="w-7 h-7 text-white" />
              </motion.span>
              <span className="text-[11px] font-semibold text-white/85 uppercase tracking-wide">
                {accepting ? "Connecting…" : "Accept"}
              </span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function IncomingRandomCallPortal() {
  if (typeof document === "undefined") return null;
  return createPortal(<IncomingRandomCallScreen />, document.body);
}
