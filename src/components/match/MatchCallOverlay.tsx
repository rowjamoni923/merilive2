import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, SkipForward, Flag, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * MatchCallOverlay — floats above ActiveCallScreen during a random-match call.
 *
 * Industry rule (Chamet / Olamet / Poppo):
 *   • Minute 1 is FREE random call (no coins, no beans).
 *   • At second `randomWindowSeconds` (default 60) the system tries to convert
 *     the random session into a normal Private Call using the host's admin-set
 *     per-minute rate.
 *   • Convert succeeds  → user keeps talking; minute 2 onward is paid private.
 *   • Convert fails     → call ends instantly for both sides + toast.
 */
export interface MatchCallOverlayProps {
  randomWindowSeconds: number;
  hostRatePerMin: number;
  onAutoEnd: (reason: "converted" | "no_balance" | "convert_failed") => void;
  onNext: () => void;
}

export default function MatchCallOverlay({
  randomWindowSeconds,
  hostRatePerMin,
  onAutoEnd,
  onNext,
}: MatchCallOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [converted, setConverted] = useState(false);
  const convertingRef = useRef(false);

  useEffect(() => {
    let raw: string | null = null;
    try { raw = window.sessionStorage.getItem("random_call:active"); } catch (_) {}
    if (!raw) return;
    let started = Date.now();
    try { started = (JSON.parse(raw) as any).started_at ?? Date.now(); } catch (_) {}
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, []);

  // Auto-convert at the 60s mark
  useEffect(() => {
    if (converted || convertingRef.current) return;
    if (elapsed < randomWindowSeconds) return;
    convertingRef.current = true;
    (async () => {
      try {
        const raw = window.sessionStorage.getItem("random_call:active");
        const info = raw ? (JSON.parse(raw) as any) : null;
        if (!info?.session_id) { onAutoEnd("convert_failed"); return; }
        const { data, error } = await supabase.rpc(
          "convert_random_to_private" as any,
          { p_session_id: info.session_id },
        );
        if (error) throw error;
        const r = data as any;
        if (r?.ok && r?.private_call_id) {
          // Stop the random-settle path firing on call end
          try { window.sessionStorage.removeItem("random_call:active"); } catch (_) {}
          try {
            window.sessionStorage.setItem(
              "random_call:converted",
              JSON.stringify({ private_call_id: r.private_call_id, at: Date.now() }),
            );
          } catch (_) {}
          setConverted(true);
          toast.success(`Now on Private Call · ${r.rate_per_min} coins/min`);
          onAutoEnd("converted");
        } else if (r?.error === "insufficient_balance") {
          toast.error("Not enough coins to continue. Please recharge.");
          onAutoEnd("no_balance");
        } else {
          toast.error("Could not switch to private call.");
          onAutoEnd("convert_failed");
        }
      } catch (_) {
        toast.error("Could not switch to private call.");
        onAutoEnd("convert_failed");
      }
    })();
  }, [elapsed, randomWindowSeconds, converted, onAutoEnd]);

  const inFree = elapsed < randomWindowSeconds;
  const freeRemaining = Math.max(0, randomWindowSeconds - elapsed);

  const handleReport = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      const raw = window.sessionStorage.getItem("random_call:active")
        ?? window.sessionStorage.getItem("random_call:converted");
      const info = raw ? JSON.parse(raw) : null;
      const sessionId = info?.session_id;
      const { data: u } = await supabase.auth.getUser();
      if (sessionId && u?.user?.id) {
        const { data, error } = await supabase.rpc("report_random_match" as any, {
          p_session_id: sessionId,
          p_reporter_id: u.user.id,
          p_reason: "random_call_violation",
          p_detail: null,
        });
        if (error) throw error;
        const suspended = (data as any)?.host_suspended;
        toast.success(suspended
          ? "Report submitted — host auto-suspended for review."
          : "Report submitted. Our team will review.");
      }
    } catch (_) {
      toast.error("Could not submit report.");
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),12px)] z-[60] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {inFree && !converted && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-300/40 backdrop-blur-md px-3 py-1.5 text-emerald-50 text-xs font-semibold shadow-lg"
          >
            <Shield className="w-3.5 h-3.5" />
            Random · free {freeRemaining}s
            {hostRatePerMin > 0 && (
              <span className="text-emerald-100/80 font-normal">
                · then {hostRatePerMin}/min
              </span>
            )}
          </motion.div>
        )}
        {converted && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500/20 border border-amber-300/40 backdrop-blur-md px-3 py-1.5 text-amber-50 text-xs font-semibold shadow-lg"
          >
            <Crown className="w-3.5 h-3.5 text-amber-200" />
            Private Call · {hostRatePerMin}/min
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-auto mt-1 flex items-center gap-2">
        <Button
          onClick={handleReport}
          variant="outline"
          size="sm"
          className="h-9 rounded-full border-white/20 bg-black/40 backdrop-blur-md text-white hover:bg-white/10"
          aria-label="Report"
        >
          <Flag className="w-4 h-4" />
        </Button>
        {!converted && (
          <Button
            onClick={onNext}
            size="sm"
            className="h-9 rounded-full px-4 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-bold shadow-lg shadow-fuchsia-500/30"
          >
            <SkipForward className="w-4 h-4 mr-1.5" /> Next
          </Button>
        )}
      </div>
    </div>
  );
}
