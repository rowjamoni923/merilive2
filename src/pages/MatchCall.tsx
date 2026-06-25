import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, X, Phone, Sparkles, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCall } from "@/components/call/CallProvider";

/**
 * MatchCall — Random 1-on-1 video matching screen.
 *
 * Design pattern follows Chamet / Olamet / Poppo: spinning globe + "Finding…"
 * Industry-standard knobs are read live from `random_call_settings`
 * (admin-managed). 40-second minimum-billable rule + free trial seconds
 * are enforced server-side by `settle_random_call()` — we just display them.
 */
export default function MatchCall() {
  const navigate = useNavigate();
  const { startCall, isInCall } = useCall();
  const wasInCallRef = useRef(false);
  const [phase, setPhase] = useState<"intro" | "searching" | "matched" | "error">("intro");
  const [queueId, setQueueId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [settings, setSettings] = useState<any>(null);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("random_call_settings" as any)
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      setSettings(data);
    })();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  // Settle the random_call_session when the user exits the call overlay.
  // Server enforces the 40-second min-billable rule inside `settle_random_call`.
  useEffect(() => {
    if (isInCall) {
      wasInCallRef.current = true;
      return;
    }
    if (!wasInCallRef.current) return;
    wasInCallRef.current = false;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem("random_call:active");
      window.sessionStorage.removeItem("random_call:active");
    } catch (_) {}
    if (!raw) return;
    try {
      const info = JSON.parse(raw) as { session_id: string; started_at: number };
      const duration = Math.max(0, Math.floor((Date.now() - info.started_at) / 1000));
      supabase.functions.invoke("random-call-settle", {
        body: { session_id: info.session_id, duration_seconds: duration, ended_by: "caller" },
      }).catch(() => {});
    } catch (_) {}
    setPhase("intro");
  }, [isInCall]);


  const cancelQueue = async () => {
    try {
      await supabase.functions.invoke("random-call-cancel", {
        body: queueId ? { queue_id: queueId } : {},
      });
    } catch (_) {}
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPhase("intro");
    setQueueId(null);
    setElapsed(0);
  };

  const startSearch = async () => {
    if (!settings?.is_enabled) {
      toast.error("Random Call is currently disabled by admin.");
      return;
    }
    setErrorMsg("");
    setPhase("searching");
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      const { data, error } = await supabase.functions.invoke("random-call-enqueue", {
        body: { preferred_langs: [], preferred_country: null },
      });
      if (error) throw error;

      const handoff = async (sessionId: string, hostId: string) => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        setPhase("matched");

        // Track session start for settlement on call end
        const startedAt = Date.now();
        try {
          window.sessionStorage.setItem(
            "random_call:active",
            JSON.stringify({ session_id: sessionId, host_id: hostId, started_at: startedAt }),
          );
        } catch (_) {}

        // Reuse the proven private-call flow — full LiveKit + UI handled by CallProvider
        const callId = await startCall(hostId);
        if (!callId) {
          toast.error("Could not start the call. Please try again.");
          setPhase("error");
          setErrorMsg("Failed to open call window.");
          return;
        }
        // CallProvider mounts ActiveCallScreen as overlay; we stay on this page
        // (it will be hidden behind the call UI). On end, the call-ended modal
        // appears and the user returns here automatically.
      };

      if ((data as any)?.status === "matched") {
        const sess = data as any;
        await handoff(sess.session_id, sess.host_id);
      } else if ((data as any)?.status === "queued") {
        setQueueId((data as any).queue_id);
        const channel = supabase
          .channel(`match-q-${(data as any).queue_id}`)
          .on(
            "postgres_changes" as any,
            { event: "UPDATE", schema: "public", table: "random_call_queue", filter: `id=eq.${(data as any).queue_id}` },
            async (payload: any) => {
              if (payload.new?.status === "matched" && payload.new?.session_id) {
                const sid = payload.new.session_id;
                const { data: sess } = await supabase
                  .from("random_call_sessions" as any)
                  .select("livekit_room, host_id")
                  .eq("id", sid)
                  .maybeSingle();
                supabase.removeChannel(channel);
                if (sess) await handoff(sid, (sess as any).host_id);
              }
            },
          )
          .subscribe();
      } else {
        throw new Error((data as any)?.error ?? "Unknown response");
      }
    } catch (e: any) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const msg = String(e?.message ?? e);
      setErrorMsg(msg.includes("insufficient_coins") ? "Not enough coins. Please recharge." : msg);
      setPhase("error");
    }
  };

  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-slate-950 via-indigo-950 to-purple-950 text-white pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 rounded-full"
          onClick={() => (phase === "searching" ? cancelQueue() : navigate(-1))}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </Button>
        <Badge className="bg-white/10 border-white/20 text-white text-xs">Match Call</Badge>
        <div className="w-9" />
      </div>

      {/* Hero */}
      <div className="px-6 pt-4 text-center">
        <div className="relative mx-auto w-56 h-56 mb-6">
          {/* spinning rings */}
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-cyan-400/40"
            animate={phase === "searching" ? { rotate: 360, scale: [1, 1.05, 1] } : { rotate: 0 }}
            transition={{ rotate: { duration: 4, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }}
          />
          <motion.div
            className="absolute inset-4 rounded-full border-2 border-fuchsia-400/40"
            animate={phase === "searching" ? { rotate: -360 } : { rotate: 0 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-8 rounded-full bg-gradient-to-br from-cyan-500/30 via-fuchsia-500/30 to-purple-500/30 backdrop-blur-md flex items-center justify-center"
            animate={phase === "searching" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Globe className="w-20 h-20 text-white drop-shadow-lg" />
          </motion.div>
        </div>

        {phase === "intro" && (
          <>
            <h1 className="text-2xl font-bold mb-2">Meet someone new</h1>
            <p className="text-white/70 text-sm mb-6">
              Get instantly matched with a host for a private 1-on-1 video call.
            </p>
          </>
        )}

        {phase === "searching" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Finding a match…</h1>
            <p className="text-white/70 text-sm mb-2">
              {elapsed}s · please keep this screen open
            </p>
            <p className="text-white/50 text-xs mb-6">Average wait: 15-45 seconds</p>
          </>
        )}

        {phase === "error" && (
          <>
            <h1 className="text-2xl font-bold mb-2 text-rose-300">Couldn't start</h1>
            <p className="text-white/70 text-sm mb-6">{errorMsg}</p>
          </>
        )}
      </div>

      {/* Info card */}
      {settings && (
        <div className="px-6">
          <Card className="bg-white/5 border-white/10 text-white p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="w-4 h-4 text-amber-300" />
              How it works
            </div>
            <ul className="text-xs text-white/80 space-y-1.5">
              <li>• First <strong>{settings.free_trial_seconds}s are free</strong> — no coins deducted.</li>
              <li>• After the free window you pay the host's per-minute rate.</li>
              <li className="flex items-start gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300 mt-0.5 flex-shrink-0" />
                <span>
                  Calls under <strong>{settings.min_billable_seconds}s</strong> earn the host nothing — please don't hang up too early.
                </span>
              </li>
              <li>• Pre-authorization: ~{settings.preauth_minutes_hold} min of coins held when you start.</li>
            </ul>
          </Card>
        </div>
      )}

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(env(safe-area-inset-bottom),16px)] bg-gradient-to-t from-slate-950 to-transparent">
        {phase === "intro" && (
          <Button
            onClick={startSearch}
            className="w-full h-14 rounded-2xl text-base font-bold bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:opacity-90 shadow-2xl shadow-cyan-500/50"
          >
            <Phone className="w-5 h-5 mr-2" />
            Start Match Call
          </Button>
        )}
        {phase === "searching" && (
          <Button
            onClick={cancelQueue}
            variant="outline"
            className="w-full h-14 rounded-2xl text-base font-bold border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            Cancel search
          </Button>
        )}
        {phase === "error" && (
          <Button
            onClick={() => setPhase("intro")}
            className="w-full h-14 rounded-2xl text-base font-bold bg-gradient-to-r from-cyan-500 to-teal-500"
          >
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
