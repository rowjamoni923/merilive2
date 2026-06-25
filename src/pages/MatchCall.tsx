import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Phone, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [searchParams] = useSearchParams();
  const instantMode = searchParams.get("instant") === "1";
  const { startCall, endCall, isInCall } = useCall();
  const wasInCallRef = useRef(false);
  const lastFiltersRef = useRef<MatchFilters | null>(null);
  const autoRestartRef = useRef(false);
  const broadcastChannelRef = useRef<any>(null);
  const broadcastIdRef = useRef<string | null>(null);
  const [phase, setPhase] = useState<"prep" | "searching" | "matched" | "error">(instantMode ? "searching" : "prep");
  const [queueId, setQueueId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [settings, setSettings] = useState<any>(null);
  const [profile, setProfile] = useState<{ id: string; coins: number; vip_tier: number; is_vip: boolean } | null>(null);
  const [hostsCount, setHostsCount] = useState(0);
  const [hostAvatars, setHostAvatars] = useState<string[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [ratingSession, setRatingSession] = useState<string | null>(null);
  // Authoritative active-session state (no longer derived from sessionStorage during settle).
  const [activeSession, setActiveSession] = useState<{
    session_id: string; host_id: string; started_at: number; ended_by?: string;
  } | null>(null);
  const activeSessionRef = useRef<typeof activeSession>(null);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);
  const timerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);

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
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
    };
  }, []);

  // Instant-mode (pill tap): auto-fire broadcast as soon as settings load.
  const instantFiredRef = useRef(false);
  useEffect(() => {
    if (!instantMode || instantFiredRef.current) return;
    if (!settings) return;
    instantFiredRef.current = true;
    void startSearch(
      { preferred_langs: [], preferred_country: null, preferred_host_gender: null },
      { broadcast: true },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instantMode, settings]);

  // Keep our queue row alive while we're in the searching phase (anti-ghost).
  useEffect(() => {
    if (phase !== "searching") {
      if (heartbeatRef.current) { window.clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      return;
    }
    const ping = () => { supabase.functions.invoke("random-call-heartbeat", { body: {} }).catch(() => {}); };
    ping();
    heartbeatRef.current = window.setInterval(ping, 15000);
    return () => {
      if (heartbeatRef.current) { window.clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, [phase]);

  // Live verified-host avatars for the searching screen (rotates every 5s).
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const { data } = await supabase.rpc("get_random_pool_sample", { _limit: 18 });
        if (!mounted) return;
        const urls = ((data as any[] | null) ?? [])
          .map((r) => r?.avatar_url)
          .filter((u): u is string => !!u);
        const shuffled = [...urls].sort(() => Math.random() - 0.5).slice(0, 5);
        setHostAvatars(shuffled);
      } catch (_) { /* ignore */ }
    };
    load();
    const t = window.setInterval(load, 5000);
    return () => { mounted = false; window.clearInterval(t); };
  }, []);

  // Settle session after user exits the call overlay (server recomputes duration authoritatively)
  useEffect(() => {
    if (isInCall) { wasInCallRef.current = true; return; }
    if (!wasInCallRef.current) return;
    wasInCallRef.current = false;

    const info = activeSessionRef.current;
    try { window.sessionStorage.removeItem("random_call:active"); } catch (_) {}
    setActiveSession(null);

    const shouldAutoRestart = autoRestartRef.current;
    autoRestartRef.current = false;

    if (info) {
      const duration = Math.max(0, Math.floor((Date.now() - info.started_at) / 1000));
      supabase.functions.invoke("random-call-settle", {
        body: {
          session_id: info.session_id,
          duration_seconds: duration,
          ended_by: info.ended_by ?? "caller",
        },
      }).catch(() => {});
      // Open the post-call rating sheet only for non-trivial calls.
      if (duration >= 10 && !shouldAutoRestart) setRatingSession(info.session_id);
    }
    if (shouldAutoRestart && lastFiltersRef.current) {
      const f = lastFiltersRef.current;
      setTimeout(() => { void startSearch(f); }, 250);
    } else {
      setPhase("prep");
    }
  }, [isInCall]);

  const cancelQueue = async () => {
    try {
      const body: any = {};
      if (queueId) body.queue_id = queueId;
      if (broadcastIdRef.current) body.broadcast_id = broadcastIdRef.current;
      await supabase.functions.invoke("random-call-cancel", { body });
    } catch (_) {}
    if (broadcastChannelRef.current) {
      try { supabase.removeChannel(broadcastChannelRef.current); } catch (_) {}
      broadcastChannelRef.current = null;
    }
    broadcastIdRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (instantMode) { navigate(-1); return; }
    setPhase("prep");
    setQueueId(null);
    setElapsed(0);
  };

  // Chamet-style "Next": end current call, server applies free-window rule
  // (zero charge if duration < random_window_seconds), then auto re-enqueue.
  const handleNext = async () => {
    // Mark ended_by in component state (authoritative) and mirror to sessionStorage for legacy readers.
    const current = activeSessionRef.current;
    if (current) {
      const next = { ...current, ended_by: "caller_skip" };
      setActiveSession(next);
      activeSessionRef.current = next;
      try { window.sessionStorage.setItem("random_call:active", JSON.stringify(next)); } catch (_) {}
    }
    autoRestartRef.current = true;
    try { await endCall(); } catch (_) {}
  };

  // Triggered by overlay when the random-window mark is reached.
  const handleAutoEnd = async (reason: "converted" | "no_balance" | "convert_failed" | "ended") => {
    if (reason === "converted") {
      // Random session already marked settled by the RPC; LiveKit room stays
      // open and continues as a private call. Clear local random state.
      setActiveSession(null);
      activeSessionRef.current = null;
      return;
    }
    // No balance OR convert disabled/failed → end the call immediately.
    try { await endCall(); } catch (_) {}
  };



  const startSearch = async (filters: MatchFilters, opts?: { broadcast?: boolean }) => {
    if (!settings?.is_enabled) {
      toast.error("Random Call is currently disabled by admin.");
      return;
    }
    const broadcast = !!opts?.broadcast;
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
          mode: broadcast ? "broadcast" : "queue",
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
        const next = { session_id: sessionId, host_id: hostId, started_at: startedAt };
        setActiveSession(next);
        activeSessionRef.current = next;
        try {
          window.sessionStorage.setItem("random_call:active", JSON.stringify(next));
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
      } else if ((data as any)?.status === "broadcasting") {
        // Chamet-style fan-out: every online verified host is ringing.
        // First to accept wins; we listen on our user channel for the assignment.
        const bid = (data as any).broadcast_id as string;
        broadcastIdRef.current = bid;
        const ringTimeout = Number((data as any).ring_timeout_seconds ?? 20);

        const { data: ud } = await supabase.auth.getUser();
        const uid = ud?.user?.id;
        if (!uid) throw new Error("not_authenticated");

        const ch = supabase.channel(`user-${uid}`)
          .on("broadcast", { event: "random_broadcast_matched" }, async (msg: any) => {
            const p = msg?.payload ?? {};
            if (p.broadcast_id !== bid) return;
            try { supabase.removeChannel(ch); } catch (_) {}
            broadcastChannelRef.current = null;
            await handoff(p.session_id, p.host_id);
          })
          .subscribe();
        broadcastChannelRef.current = ch;

        // Auto-timeout if no host picks up within ring window
        window.setTimeout(async () => {
          if (broadcastIdRef.current !== bid) return;
          if (timerRef.current) window.clearInterval(timerRef.current);
          try { supabase.removeChannel(ch); } catch (_) {}
          broadcastChannelRef.current = null;
          broadcastIdRef.current = null;
          try { await supabase.functions.invoke("random-call-cancel", { body: { broadcast_id: bid } }); } catch (_) {}
          setErrorMsg("No host picked up. Please try again.");
          setPhase("error");
        }, ringTimeout * 1000 + 500);
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
    // Match the server-side hold so users see the same gate the server applies.
    const maxRate = Number(settings?.host_max_rate_coins_per_min ?? settings?.default_host_rate_coins_per_min ?? 0);
    const preauthMin = Number(settings?.preauth_minutes_hold ?? 2);
    const holdAmount = Math.max(0, maxRate * preauthMin);
    return (
      <>
        <PreMatchPrep
          diamondBalance={profile?.coins ?? 0}
          hostRatePerMin={holdAmount > 0 ? holdAmount : (settings?.default_host_rate_coins_per_min ?? 0)}
          freeTrialSeconds={settings?.random_window_seconds ?? 60}
          minBillableSeconds={settings?.random_window_seconds ?? 60}
          availableHostsCount={hostsCount}
          estimatedWaitSeconds={estWait}
          isVip={!!(profile?.is_vip || (profile?.vip_tier ?? 0) > 0)}
          countryRequiresVip={!!settings?.country_filter_requires_vip}
          genderFilterEnabled={!!settings?.enable_gender_filter}
          countryFilterEnabled={!!settings?.enable_country_filter}
          onStart={(filters) => startSearch(filters, { broadcast: true })}
        />
        <PostCallRatingSheet
          open={!!ratingSession}
          sessionId={ratingSession}
          onClose={() => setRatingSession(null)}
        />
      </>
    );
  }

  // SEARCHING / MATCHED / ERROR — Olamet-style candidate row + safety tagline
  return (
    <div className="relative min-h-[100svh] overflow-hidden text-white pb-[max(env(safe-area-inset-bottom),16px)]
      bg-[radial-gradient(circle_at_50%_35%,#7c3aed_0%,#5b21b6_42%,#1e1b4b_100%)]">
      {isInCall && (
        <MatchCallOverlay
          randomWindowSeconds={settings?.random_window_seconds ?? 60}
          hostRatePerMin={settings?.default_host_rate_coins_per_min ?? 0}
          autoConvert={settings?.auto_convert_to_private !== false}
          startedAt={activeSession?.started_at}
          sessionId={activeSession?.session_id ?? null}
          hostId={activeSession?.host_id ?? null}
          onAutoEnd={handleAutoEnd}
          onNext={handleNext}
        />
      )}

      {/* Soft animated bloom */}
      <motion.div
        className="absolute left-1/2 top-[30%] -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-fuchsia-400/20 blur-3xl"
        animate={phase === "searching" ? { scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] } : { opacity: 0.3 }}
        transition={{ duration: 3, repeat: Infinity }}
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),16px)]">
        <div className="w-10" />
        <div className="text-[11px] uppercase tracking-[0.2em] text-white/70">
          {phase === "searching" ? "Matching" : phase === "matched" ? "Connected" : "Failed"}
        </div>
        <Button variant="ghost" size="icon" aria-label="Close"
          onClick={() => (phase === "searching" ? cancelQueue() : navigate(-1))}
          className="text-white hover:bg-white/10 rounded-full h-10 w-10 bg-white/10 backdrop-blur-md border border-white/15">
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Candidate-avatars carousel + status (Olamet pattern) */}
      <div className="relative z-10 mt-[18vh] flex flex-col items-center">
        <div className="flex items-center justify-center gap-3 mb-7">
          {[0, 1, 2, 3, 4].map((i) => (
            <motion.div
              key={i}
              className="rounded-full bg-gradient-to-br from-white/30 to-white/5 border-2 border-white/40 overflow-hidden"
              style={{
                width: i === 2 ? 64 : i === 1 || i === 3 ? 52 : 40,
                height: i === 2 ? 64 : i === 1 || i === 3 ? 52 : 40,
              }}
              animate={phase === "searching"
                ? { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }
                : { scale: 1, opacity: 1 }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
            >
              <div className="w-full h-full bg-gradient-to-br from-fuchsia-400/60 via-purple-400/60 to-pink-400/60" />
            </motion.div>
          ))}
        </div>

        {phase === "searching" && (
          <>
            <h1 className="text-[22px] font-bold tracking-tight">Matching in progress</h1>
            <div className="mt-1 text-white/65 text-xs tabular-nums">{elapsed}s · please keep this screen open</div>
          </>
        )}
        {phase === "matched" && (
          <h1 className="text-[22px] font-bold text-emerald-300">Match found!</h1>
        )}
        {phase === "error" && (
          <>
            <h1 className="text-[22px] font-bold text-rose-200">Couldn't start</h1>
            <p className="text-white/70 text-xs mt-1 px-8 text-center">{errorMsg}</p>
          </>
        )}
      </div>

      {/* Safety tagline (Globe-matcher pattern) */}
      {phase === "searching" && (
        <div className="absolute left-0 right-0 bottom-32 z-10 flex items-center justify-center gap-1.5 text-[12px] text-white/80 px-6 text-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
          <span>Please behave politely during the chat</span>
        </div>
      )}

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 px-6 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 z-10">
        {phase === "searching" && (
          <Button onClick={cancelQueue} variant="outline"
            className="w-full h-13 rounded-full text-sm font-bold border-white/25 bg-white/10 backdrop-blur-md text-white hover:bg-white/20">
            Cancel
          </Button>
        )}
        {phase === "error" && (
          <Button onClick={() => setPhase("prep")}
            className="w-full h-14 rounded-full text-base font-bold bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500 shadow-[0_14px_40px_-10px_rgba(168,85,247,0.7)]">
            <Phone className="w-5 h-5 mr-2" /> Try again
          </Button>
        )}
      </div>
    </div>
  );
}
