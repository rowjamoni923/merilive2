import { useEffect, useCallback, useRef, useState } from "react";
import { Phone, PhoneOff, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useSound } from "@/hooks/useSound";
import { useNativeAudioFocus } from "@/hooks/useNativeAudioFocus";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

interface IncomingCallModalProps {
  isOpen: boolean;
  callerName: string;
  callerAvatar: string | null;
  callerLevel?: number;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Chamet/Bigo-class full-screen incoming call surface.
 *
 * Layout:
 *   • Layer 0 — caller avatar as full-screen blurred background
 *   • Layer 1 — dark vignette + subtle ambient color glow
 *   • Layer 2 — top safe-area: "Incoming Video Call" label + caller name + avatar (parallax)
 *   • Layer 3 — bottom thumb-zone: Decline / Accept (≥64dp, far-apart, ≥80px bottom inset)
 *
 * Parallax: subtle pointermove translate on the sharp foreground avatar so it
 * feels alive against the blurred backdrop. CSS-only — no extra deps.
 */
export function IncomingCallModal({
  isOpen,
  callerName,
  callerAvatar,
  callerLevel = 1,
  onAccept,
  onDecline,
}: IncomingCallModalProps) {
  const { startRingtone, stopRingtone } = useSound();
  // Pkg444 Phase-5: route ringtone through the ringer stream/volume while open.
  useNativeAudioFocus({ enabled: isOpen, intent: 'ringtone' });
  // Section#5 pass-2 (Bug F): guard against double-tap racing accept/decline.
  const processingRef = useRef(false);

  // Parallax — subtle 2D translate based on pointer/touch position.
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      processingRef.current = false;
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => { stopRingtone(); };
  }, [isOpen, startRingtone, stopRingtone]);

  const handleAccept = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    console.log('[IncomingCall] Accept button clicked');
    stopRingtone();
    onAccept();
  }, [stopRingtone, onAccept]);

  const handleDecline = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;
    console.log('[IncomingCall] Decline button clicked');
    stopRingtone();
    onDecline();
  }, [stopRingtone, onDecline]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // ±10px parallax range — subtle, professional.
    setTilt({
      x: Math.max(-10, Math.min(10, ((e.clientX - cx) / rect.width) * 20)),
      y: Math.max(-10, Math.min(10, ((e.clientY - cy) / rect.height) * 20)),
    });
  }, []);

  const handlePointerLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  // Safe fallback avatar — first letter of caller name.
  const fallbackLetter = (callerName || '?').trim().charAt(0).toUpperCase();
  const hasAvatar = !!callerAvatar;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="incoming-call-surface"
          ref={surfaceRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[2147483640] overflow-hidden"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          style={{ touchAction: 'none' }}
        >
          {/* ── Layer 0: blurred caller avatar as full-screen background ── */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              transform: `translate3d(${tilt.x * -1.5}px, ${tilt.y * -1.5}px, 0) scale(1.15)`,
              transition: 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
              willChange: 'transform',
            }}
          >
            {hasAvatar ? (
              <img
                src={callerAvatar!}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                style={{ filter: 'blur(28px) saturate(1.15) brightness(0.55)' }}
                draggable={false}
              />
            ) : (
              <div
                className="absolute inset-0"
                style={{
                  background:
                    'radial-gradient(120% 80% at 50% 25%, rgba(34,197,94,0.35) 0%, rgba(15,5,36,0.95) 55%, rgba(0,0,0,1) 100%)',
                }}
              />
            )}
          </div>

          {/* ── Layer 1: vignette + ambient color wash ── */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(80% 60% at 50% 0%, rgba(34,197,94,0.18) 0%, transparent 55%), linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.25) 35%, rgba(0,0,0,0.85) 100%)',
            }}
          />

          {/* ── Layer 2: top — label + caller card with parallax ── */}
          <div className="absolute inset-x-0 top-0 pt-[max(env(safe-area-inset-top),20px)] px-6">
            {/* "Incoming Video Call" pill */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.05, type: 'spring', damping: 22, stiffness: 280 }}
              className="flex justify-center"
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/8 backdrop-blur-xl border border-white/15">
                <div className="relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <div className="absolute inset-0 w-1.5 h-1.5 rounded-full bg-green-400 animate-ping" />
                </div>
                {/* Video icon removed per design — green pulse dot is the only indicator */}
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/90">
                  Incoming Video Call
                </span>
              </div>
            </motion.div>

            {/* Foreground avatar — parallax + ripple */}
            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.92 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.12, type: 'spring', damping: 20, stiffness: 240 }}
              className="flex flex-col items-center mt-10"
              style={{
              }}
            >
              <div className="relative">
                {/* Outer ripple rings */}
                <div
                  className="absolute -inset-4 rounded-full border border-green-400/35 animate-ping"
                  style={{ animationDuration: '2.2s' }}
                />
                <div
                  className="absolute -inset-2 rounded-full border border-green-400/55"
                  style={{ boxShadow: '0 0 28px rgba(34,197,94,0.45)' }}
                />
                {/* Avatar */}
                <div className="relative rounded-full">
                  {hasAvatar ? (
                    <AvatarWithFrame
                      src={callerAvatar}
                      name={callerName}
                      level={callerLevel}
                      size="lg"
                      showAnimation={false}
                    />
                  ) : (
                    <div
                      className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-bold text-white"
                      style={{
                        background: 'linear-gradient(135deg, #22c55e 0%, #10b981 100%)',
                        boxShadow: '0 8px 28px rgba(34,197,94,0.45), inset 0 2px 6px rgba(255,255,255,0.25)',
                      }}
                    >
                      {fallbackLetter}
                    </div>
                  )}
                </div>
              </div>

              {/* Caller name */}
              <div className="mt-6 flex items-center gap-2 max-w-[88vw]">
                <h2 className="text-white font-bold text-3xl truncate drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                  {callerName || 'Unknown'}
                </h2>
                {callerLevel >= 20 && (
                  <Sparkles className="w-5 h-5 text-amber-300 flex-shrink-0" />
                )}
              </div>
              <p className="text-white/65 text-sm mt-2 tracking-wide">
                Calling you…
              </p>

              {/* Sound wave bars under name */}
              <div className="flex items-end justify-center gap-1 mt-5 h-4">
                {[...Array(14)].map((_, i) => (
                  <div
                    key={i}
                    className="w-[3px] rounded-full bg-gradient-to-t from-green-500/80 to-green-200/90 animate-bounce"
                    style={{
                      height: `${6 + Math.abs(Math.sin(i * 0.6)) * 10}px`,
                      animationDelay: `${i * 0.05}s`,
                      animationDuration: '0.7s',
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </div>

          {/* ── Layer 3: bottom thumb-zone — Decline / Accept ── */}
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.18, type: 'spring', damping: 22, stiffness: 240 }}
            className="absolute inset-x-0 bottom-0 pb-[max(env(safe-area-inset-bottom),24px)]"
          >
            <div className="flex items-center justify-around px-10 pb-6">
              {/* Decline — left thumb zone */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDecline(); }}
                type="button"
                aria-label="Decline call"
                className="group flex flex-col items-center gap-2 touch-manipulation"
              >
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  style={{
                    boxShadow:
                      '0 10px 28px -6px rgba(239,68,68,0.65), 0 4px 12px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 8px rgba(0,0,0,0.3)',
                    border: '1px solid rgba(252,165,165,0.45)',
                  }}
                >
                  <PhoneOff className="w-7 h-7 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                </div>
                <span className="text-[11px] font-semibold text-white/80 tracking-wide">
                  Decline
                </span>
              </button>

              {/* Accept — right thumb zone, slightly larger + breathing pulse */}
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAccept(); }}
                type="button"
                aria-label="Accept call"
                className="group flex flex-col items-center gap-2 touch-manipulation"
              >
                <div className="relative">
                  {/* Breathing pulse halo */}
                  <div
                    className="absolute -inset-2 rounded-full border-2 border-green-400/50 animate-ping"
                    style={{ animationDuration: '1.6s' }}
                  />
                  <div
                    className="relative w-[72px] h-[72px] rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={{
                      background:
                        'radial-gradient(120% 120% at 30% 20%, #86efac 0%, #22c55e 45%, #15803d 100%)',
                      boxShadow:
                        '0 12px 32px -6px rgba(34,197,94,0.65), 0 4px 12px -2px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -3px 8px rgba(0,0,0,0.3)',
                    }}
                  >
                    <Phone className="w-8 h-8 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-white tracking-wide">
                  Accept
                </span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
