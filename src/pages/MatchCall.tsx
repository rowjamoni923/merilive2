import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Globe, X, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCall } from "@/components/call/CallProvider";
import PreMatchPrep, { type MatchFilters } from "@/components/match/PreMatchPrep";
import MatchCallOverlay from "@/components/match/MatchCallOverlay";
import PostCallRatingSheet from "@/components/match/PostCallRatingSheet";

/**
 * MatchCall — Random 1-on-1 video matching.
 * Phases: prep → searching → matched → error
 * The prep screen (Chamet-style) collects filters + previews the self-camera
 * before the user enters the queue. The 40-second min-billable rule and free
 * trial seconds are enforced server-side by settle_random_call().
 */
export default function MatchCall() {
  const navigate = useNavigate();
  const { startCall, endCall, isInCall } = useCall();
  const wasInCallRef = useRef(false);
  const lastFiltersRef = useRef<MatchFilters | null>(null);
  const autoRestartRef = useRef(false);
  const [phase, setPhase] = useState<"prep" | "searching" | "matched" | "error">("prep");
  const [queueId, setQueueId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [settings, setSettings] = useState<any>(null);
  const [profile, setProfile] = useState<{ id: string; coins: number; vip_tier: number; is_vip: boolean } | null>(null);
  const [hostsCount, setHostsCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("random_call_settings" as any).select("*").eq("id", 1).maybeSingle();
      setSettings(s);
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        const { data: p } = await supabase.from("profiles")
          .select("id, coins, vip_tier, is_vip").eq("id", u.user.id).maybeSingle();
        if (p) setProfile(p as any);
      }
      const { count } = await supabase
        .from("random_call_queue" as any)
        .select("id", { count: "exact", head: true })
        .eq("role", "host").eq("status", "waiting");
      setHostsCount(count || 0);
    })();
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, []);

  // Settle session after user exits the call overlay
  useEffect(() => {
    if (isInCall) { wasInCallRef.current = true; return; }
    if (!wasInCallRef.current) return;
    wasInCallRef.current = false;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem("random_call:active");
      window.sessionStorage.removeItem("random_call:active");
    } catch (_) {}
    const shouldAutoRestart = autoRestartRef.current;
    autoRestartRef.current = false;
    if (raw) {
      try {
        const info = JSON.parse(raw) as { session_id: string; started_at: number; ended_by?: string };
        const duration = Math.max(0, Math.floor((Date.now() - info.started_at) / 1000));
        supabase.functions.invoke("random-call-settle", {
          body: { session_id: info.session_id, duration_seconds: duration, ended_by: info.ended_by ?? "caller" },
        }).catch(() => {});
      } catch (_) {}
    }
    if (shouldAutoRestart && lastFiltersRef.current) {
      // Re-enqueue with the same filters (Chamet-style Next)
      const f = lastFiltersRef.current;
      setTimeout(() => { void startSearch(f); }, 250);
    } else {
      setPhase("prep");
    }
  }, [isInCall]);

  const cancelQueue = async () => {
    try { await supabase.functions.invoke("random-call-cancel", { body: queueId ? { queue_id: queueId } : {} }); } catch (_) {}
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPhase("prep");
    setQueueId(null);
    setElapsed(0);
  };

  // Chamet-style "Next": end current call, server applies free-window rule
  // (zero charge if duration < random_window_seconds), then auto re-enqueue.
  const handleNext = async () => {
    try {
      const raw = window.sessionStorage.getItem("random_call:active");
      if (raw) {
        const info = JSON.parse(raw) as any;
        info.ended_by = "caller_skip";
        window.sessionStorage.setItem("random_call:active", JSON.stringify(info));
      }
    } catch (_) {}
    autoRestartRef.current = true;
    try { await endCall(); } catch (_) {}
  };

  // Triggered by overlay when 60s convert attempt resolves.
  const handleAutoEnd = async (reason: "converted" | "no_balance" | "convert_failed") => {
    if (reason === "converted") {
      // Random session already marked settled by the RPC; the existing call
      // stays open as a private call. Nothing else to do here.
      return;
    }
    // No balance OR convert failed → end the call immediately for both sides.
    try { await endCall(); } catch (_) {}
  };



  const startSearch = async (filters: MatchFilters) => {
    if (!settings?.is_enabled) {
      toast.error("Random Call is currently disabled by admin.");
      return;
    }
    lastFiltersRef.current = filters;
    setErrorMsg("");
    setPhase("searching");
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);

    try {
      // Stable per-install device id for multi-device safety
      let deviceId = "";
      try {
        deviceId = window.localStorage.getItem("ml_device_id") || "";
        if (!deviceId) {
          deviceId = (crypto as any).randomUUID?.() || `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          window.localStorage.setItem("ml_device_id", deviceId);
        }
      } catch (_) {}

      const { data, error } = await supabase.functions.invoke("random-call-enqueue", {
        body: {
          preferred_langs: filters.preferred_langs,
          preferred_country: filters.preferred_country,
          preferred_host_gender: filters.preferred_host_gender,
          device_id: deviceId,
        },
      });
      // Server may return a structured 429 error (skip cooldown / daily cap)
      let errPayload: any = (data as any)?.error ? data : null;
      if (!errPayload && error && (error as any).context?.json) {
        try { errPayload = await (error as any).context.json(); } catch (_) {}
      }
      if (errPayload?.error === "skip_cooldown") {
        if (timerRef.current) window.clearInterval(timerRef.current);
        const secs = errPayload.cooldown_seconds_remaining ?? 0;
        toast.error(`You're skipping too fast. Try again in ${secs}s.`);
        setPhase("prep");
        return;
      }
      if (errPayload?.error === "daily_skip_limit_reached") {
        if (timerRef.current) window.clearInterval(timerRef.current);
        toast.error(`Daily skip limit reached (${errPayload.daily_used}/${errPayload.daily_limit}). Try again tomorrow.`);
        setPhase("prep");
        return;
      }
      if (error) throw error;

      const handoff = async (sessionId: string, hostId: string) => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        setPhase("matched");
        const startedAt = Date.now();
        try {
          window.sessionStorage.setItem("random_call:active",
            JSON.stringify({ session_id: sessionId, host_id: hostId, started_at: startedAt }));
        } catch (_) {}
        const callId = await startCall(hostId);
        if (!callId) {
          toast.error("Could not start the call. Please try again.");
          setPhase("error");
          setErrorMsg("Failed to open call window.");
        }
      };

      if ((data as any)?.status === "reconnected") {
        toast.message("Reconnected to your active match.");
        const r = data as any;
        await handoff(r.session_id, r.host_id);
      } else if ((data as any)?.status === "matched") {
        const sess = data as any;
        await handoff(sess.session_id, sess.host_id);
      } else if ((data as any)?.status === "queued") {
        setQueueId((data as any).queue_id);
        const channel = supabase
          .channel(`match-q-${(data as any).queue_id}`)
          .on("postgres_changes" as any,
            { event: "UPDATE", schema: "public", table: "random_call_queue", filter: `id=eq.${(data as any).queue_id}` },
            async (payload: any) => {
              if (payload.new?.status === "matched" && payload.new?.session_id) {
                const sid = payload.new.session_id;
                const { data: sess } = await supabase
                  .from("random_call_sessions" as any)
                  .select("livekit_room, host_id").eq("id", sid).maybeSingle();
                supabase.removeChannel(channel);
                if (sess) await handoff(sid, (sess as any).host_id);
              }
            },
          ).subscribe();
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

  // PREP PHASE — Chamet-style prep screen
  if (phase === "prep") {
    const estWait = hostsCount > 0
      ? Math.max(8, Math.min(60, Math.round(45 / Math.max(1, hostsCount))))
      : 45;
    return (
      <PreMatchPrep
        diamondBalance={profile?.coins ?? 0}
        hostRatePerMin={settings?.default_host_rate_coins_per_min ?? 0}
        freeTrialSeconds={settings?.random_window_seconds ?? 60}
        minBillableSeconds={settings?.random_window_seconds ?? 60}
        availableHostsCount={hostsCount}
        estimatedWaitSeconds={estWait}
        isVip={!!(profile?.is_vip || (profile?.vip_tier ?? 0) > 0)}
        countryRequiresVip={!!settings?.country_filter_requires_vip}
        genderFilterEnabled={!!settings?.enable_gender_filter}
        countryFilterEnabled={!!settings?.enable_country_filter}
        onStart={(filters) => startSearch(filters)}
      />

    );
  }

  // SEARCHING / MATCHED / ERROR phases — original luxe globe
  return (
    <div className="min-h-[100svh] bg-gradient-to-b from-slate-950 via-indigo-950 to-purple-950 text-white pb-[max(env(safe-area-inset-bottom),16px)]">
      {isInCall && (
        <MatchCallOverlay
          randomWindowSeconds={settings?.random_window_seconds ?? 60}
          hostRatePerMin={settings?.default_host_rate_coins_per_min ?? 0}
          onAutoEnd={handleAutoEnd}
          onNext={handleNext}
        />
      )}

      <div className="flex items-center justify-between p-4 pt-[max(env(safe-area-inset-top),16px)]">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/10 rounded-full"
          onClick={() => (phase === "searching" ? cancelQueue() : navigate(-1))} aria-label="Close">
          <X className="h-5 w-5" />
        </Button>
        <Badge className="bg-white/10 border-white/20 text-white text-xs">Match Call</Badge>
        <div className="w-9" />
      </div>

      <div className="px-6 pt-4 text-center">
        <div className="relative mx-auto w-56 h-56 mb-6">
          <motion.div className="absolute inset-0 rounded-full border-2 border-cyan-400/40"
            animate={phase === "searching" ? { rotate: 360, scale: [1, 1.05, 1] } : { rotate: 0 }}
            transition={{ rotate: { duration: 4, repeat: Infinity, ease: "linear" }, scale: { duration: 2, repeat: Infinity } }} />
          <motion.div className="absolute inset-4 rounded-full border-2 border-fuchsia-400/40"
            animate={phase === "searching" ? { rotate: -360 } : { rotate: 0 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }} />
          <motion.div className="absolute inset-8 rounded-full bg-gradient-to-br from-cyan-500/30 via-fuchsia-500/30 to-purple-500/30 backdrop-blur-md flex items-center justify-center"
            animate={phase === "searching" ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 2, repeat: Infinity }}>
            <Globe className="w-20 h-20 text-white drop-shadow-lg" />
          </motion.div>
        </div>

        {phase === "searching" && (
          <>
            <h1 className="text-2xl font-bold mb-1">Finding a match…</h1>
            <p className="text-white/70 text-sm mb-2">{elapsed}s · please keep this screen open</p>
            <p className="text-white/50 text-xs mb-6">Average wait: 15-45 seconds</p>
          </>
        )}
        {phase === "matched" && (
          <h1 className="text-2xl font-bold mb-2 text-emerald-300">Match found!</h1>
        )}
        {phase === "error" && (
          <>
            <h1 className="text-2xl font-bold mb-2 text-rose-300">Couldn't start</h1>
            <p className="text-white/70 text-sm mb-6">{errorMsg}</p>
          </>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 pb-[max(env(safe-area-inset-bottom),16px)] bg-gradient-to-t from-slate-950 to-transparent">
        {phase === "searching" && (
          <Button onClick={cancelQueue} variant="outline"
            className="w-full h-14 rounded-2xl text-base font-bold border-white/20 bg-white/5 text-white hover:bg-white/10">
            Cancel search
          </Button>
        )}
        {phase === "error" && (
          <Button onClick={() => setPhase("prep")}
            className="w-full h-14 rounded-2xl text-base font-bold bg-gradient-to-r from-cyan-500 to-teal-500">
            <Phone className="w-5 h-5 mr-2" /> Try again
          </Button>
        )}
      </div>
    </div>
  );
}
