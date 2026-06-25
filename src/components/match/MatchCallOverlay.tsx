import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, SkipForward, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * MatchCallOverlay — floats above ActiveCallScreen during a random-match call.
 * Surfaces the 40s billing-shield countdown and a Chamet-style "Next" button
 * that ends the current match and re-enqueues the caller with the same
 * filters. Only mounts when an active random_call session is in sessionStorage.
 */
export interface MatchCallOverlayProps {
  minBillableSeconds: number;
  onNext: () => void; // settle + re-enqueue
}

export default function MatchCallOverlay({ minBillableSeconds, onNext }: MatchCallOverlayProps) {
  const [elapsed, setElapsed] = useState(0);
  const [reporting, setReporting] = useState(false);

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

  const inShield = elapsed < minBillableSeconds;
  const shieldRemaining = Math.max(0, minBillableSeconds - elapsed);

  const handleReport = async () => {
    if (reporting) return;
    setReporting(true);
    try {
      const raw = window.sessionStorage.getItem("random_call:active");
      const info = raw ? JSON.parse(raw) : null;
      if (info?.host_id) {
        await supabase.from("user_reports" as any).insert({
          reported_user_id: info.host_id,
          reason: "random_call_violation",
          context: "random_call",
          source_id: info.session_id,
        });
        toast.success("Report submitted. Our team will review.");
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
        {inShield && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-emerald-500/20 border border-emerald-300/40 backdrop-blur-md px-3 py-1.5 text-emerald-50 text-xs font-semibold shadow-lg"
          >
            <Shield className="w-3.5 h-3.5" />
            Free preview · {shieldRemaining}s
          </motion.div>
        )}
        {!inShield && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto flex items-center gap-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-md px-3 py-1.5 text-white text-xs font-semibold shadow-lg"
          >
            <Shield className="w-3.5 h-3.5 text-amber-300" />
            Billing active · {elapsed}s
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
        <Button
          onClick={onNext}
          size="sm"
          className="h-9 rounded-full px-4 bg-gradient-to-r from-fuchsia-500 to-pink-500 text-white font-bold shadow-lg shadow-fuchsia-500/30"
        >
          <SkipForward className="w-4 h-4 mr-1.5" /> Next
        </Button>
      </div>
    </div>
  );
}
