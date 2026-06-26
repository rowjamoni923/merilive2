import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Flag, SkipForward, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCall } from "@/components/call/CallContext";

/**
 * MatchCallOverlay — Chamet/Olamet-style in-call HUD overlay.
 *
 * Layout (matches reference apps):
 *   • Top-left: glassmorphic mini-bar with caller+host avatars and a red hang-up
 *     bubble (single-tap end).
 *   • Bottom-center: "Random match · Free" gradient capsule that switches to
 *     "Private · N/min" after auto-conversion at the 60s mark.
 *
 * Industry rule (Chamet / Olamet / Poppo):
 *   Minute 1 free → at `randomWindowSeconds` convert to Private Call.
 *   Convert ok → keep talking (paid); convert fail → end instantly.
 */
export interface MatchCallOverlayProps {
  randomWindowSeconds: number;
  hostRatePerMin: number;
  /** When false, the call simply ends at the random window instead of converting. */
  autoConvert?: boolean;
  /** Authoritative session start (ms). Falls back to sessionStorage only if absent. */
  startedAt?: number;
  /** Session id from the matched response — authoritative source, no storage round-trip. */
  sessionId?: string | null;
  /** Host id — used to fetch the mini-bar avatar pair. */
  hostId?: string | null;
  onAutoEnd: (reason: "converted" | "no_balance" | "convert_failed" | "ended") => void;
  onNext: () => void;
}

export default function MatchCallOverlay({
  randomWindowSeconds,
  hostRatePerMin,
  autoConvert = true,
  startedAt,
  sessionId,
  hostId,
  onAutoEnd,
  onNext,
}: MatchCallOverlayProps) {
  const { endCall } = useCall();
  const [elapsed, setElapsed] = useState(0);
  const [reporting, setReporting] = useState(false);
  const [converted, setConverted] = useState(false);
  const [avatars, setAvatars] = useState<{ me?: string; host?: string }>({});
  const convertingRef = useRef(false);

  // Timer — prefer prop, fall back to sessionStorage, then to now.
  useEffect(() => {
    let started = startedAt ?? Date.now();
    if (!startedAt) {
      try {
        const raw = window.sessionStorage.getItem("random_call:active");
        if (raw) started = (JSON.parse(raw) as any).started_at ?? Date.now();
      } catch (_) { /* */ }
    }
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const t = window.setInterval(tick, 500);
    return () => window.clearInterval(t);
  }, [startedAt]);

  // Pull both avatars for the mini-bar
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        let resolvedHost = hostId ?? null;
        if (!resolvedHost) {
          try {
            const raw = window.sessionStorage.getItem("random_call:active");
            resolvedHost = raw ? (JSON.parse(raw) as any).host_id ?? null : null;
          } catch (_) { /* */ }
        }
        const ids = [u?.user?.id, resolvedHost].filter(Boolean) as string[];
        if (ids.length === 0) return;
        const { data: profs } = await supabase
          .from("profiles").select("id, avatar_url").in("id", ids);
        const myId = u?.user?.id;
        const me = profs?.find((p: any) => p.id === myId)?.avatar_url;
        const host = profs?.find((p: any) => p.id === resolvedHost)?.avatar_url;
        setAvatars({ me, host });
      } catch (_) { /* */ }
    })();
  }, [hostId]);

  // Auto-convert at the random-window mark (respects admin auto_convert_to_private)
  useEffect(() => {
    if (converted || convertingRef.current) return;
    if (elapsed < randomWindowSeconds) return;
    convertingRef.current = true;
    if (!autoConvert) {
      // Admin disabled auto-convert — end the call cleanly at the free window.
      onAutoEnd("ended");
      return;
    }
    (async () => {
      try {
        let sid = sessionId ?? null;
        if (!sid) {
          try {
            const raw = window.sessionStorage.getItem("random_call:active");
            sid = raw ? (JSON.parse(raw) as any).session_id ?? null : null;
          } catch (_) { /* */ }
        }
        if (!sid) { onAutoEnd("convert_failed"); return; }
        const { data, error } = await supabase.rpc(
          "convert_random_to_private" as any,
          { p_session_id: sid },
        );
        if (error) throw error;
        const r = data as any;
        if (r?.ok && r?.private_call_id) {
          try { window.sessionStorage.removeItem("random_call:active"); } catch (_) {}
          try {
            window.sessionStorage.setItem("random_call:converted",
              JSON.stringify({ private_call_id: r.private_call_id, at: Date.now() }));
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
  }, [elapsed, randomWindowSeconds, converted, onAutoEnd, autoConvert, sessionId]);

  const freeRemaining = Math.max(0, randomWindowSeconds - elapsed);
  const inFree = !converted && elapsed < randomWindowSeconds;

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

  const Avatar = ({ url, ring }: { url?: string; ring: string }) => (
    url ? (
      <img src={url} alt="" className={`w-8 h-8 rounded-full object-cover ring-2 ${ring}`} />
    ) : (
      <span className={`w-8 h-8 rounded-full bg-white/30 ring-2 ${ring}`} />
    )
  );

  return (
    <>
      {/* TOP-LEFT mini active-call bar (Chamet/Olamet pattern) */}
      <div className="pointer-events-none fixed left-3 top-[max(env(safe-area-inset-top),12px)] z-[60]">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="pointer-events-auto flex items-center gap-1.5 pl-1 pr-1 h-11 rounded-full
            bg-gradient-to-r from-fuchsia-500/85 via-purple-500/85 to-pink-500/85
            border border-white/20 backdrop-blur-md shadow-lg"
        >
          <div className="flex -space-x-2 pl-0.5">
            <Avatar url={avatars.host} ring="ring-white/80" />
            <Avatar url={avatars.me} ring="ring-white/80" />
          </div>
          {converted && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-white pr-1.5">
              Private
            </span>
          )}
          <button
            onClick={() => endCall().catch(() => {})}
            aria-label="End call"
            className="w-9 h-9 rounded-full bg-rose-500 hover:bg-rose-600 grid place-items-center shadow-md"
          >
            <Phone className="w-4 h-4 text-white rotate-[135deg]" />
          </button>
        </motion.div>
      </div>

      {/* TOP-RIGHT report + next */}
      <div className="pointer-events-none fixed right-3 top-[max(env(safe-area-inset-top),12px)] z-[60] flex items-center gap-2">
        <button
          onClick={handleReport}
          aria-label="Report"
          className="pointer-events-auto h-9 w-9 rounded-full bg-black/45 backdrop-blur-md border border-white/15 grid place-items-center text-white/90"
        >
          <Flag className="w-4 h-4" />
        </button>
        {!converted && (
          <button
            onClick={onNext}
            aria-label="Next match"
            className="pointer-events-auto h-9 px-3 rounded-full bg-gradient-to-r from-cyan-400 to-sky-500 text-white font-bold text-xs shadow-md flex items-center gap-1"
          >
            <SkipForward className="w-3.5 h-3.5" /> Next
          </button>
        )}
      </div>

      {/* BOTTOM-CENTER status capsule (Chamet "Random match Free" pill) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] z-[60] flex justify-center px-6">
        <AnimatePresence mode="wait">
          {inFree ? (
            <motion.div
              key="free"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              className="pointer-events-auto px-5 py-2.5 rounded-full
                bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500
                shadow-[0_10px_30px_-8px_rgba(168,85,247,0.7)] border border-white/20 text-center"
            >
              <div className="text-[13px] font-bold text-white leading-tight">Random match</div>
              <div className="text-[10px] text-white/85 leading-tight">
                Free · {freeRemaining}s
                {hostRatePerMin > 0 && <span className="opacity-80"> · then {hostRatePerMin}/min</span>}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="paid"
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto px-5 py-2.5 rounded-full
                bg-gradient-to-r from-amber-400 to-orange-500
                shadow-[0_10px_30px_-8px_rgba(245,158,11,0.6)] border border-white/20 text-center flex items-center gap-2"
            >
              <Crown className="w-4 h-4 text-white" />
              <div>
                <div className="text-[13px] font-bold text-white leading-tight">Private Call</div>
                <div className="text-[10px] text-white/90 leading-tight">{hostRatePerMin} diamonds / min</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
