import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCall } from "@/components/call/CallContext";
import PreMatchPrep, { type MatchFilters } from "@/components/match/PreMatchPrep";
import MatchCallOverlay from "@/components/match/MatchCallOverlay";
import PostCallRatingSheet from "@/components/match/PostCallRatingSheet";
import { extractEdgeFnErrorPayload } from "@/utils/edgeFnError";
import { getBalanceWithFetch } from "@/hooks/useUserBalance";

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
  const [profile, setProfile] = useState<{
    id: string;
    coins: number;
    diamonds?: number | null;
    vip_tier: number | null;
    current_vip_tier_id?: string | null;
  } | null>(null);
  const [hostsCount, setHostsCount] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [matchedAvatarUrl, setMatchedAvatarUrl] = useState<string | null>(null);
  const [ratingSession, setRatingSession] = useState<string | null>(null);
  const closeRatingSheet = () => setRatingSession(null);
  // Authoritative active-session state (no longer derived from sessionStorage during settle).
  const [activeSession, setActiveSession] = useState<{
    session_id: string; host_id: string; started_at: number; ended_by?: string;
  } | null>(null);
  const activeSessionRef = useRef<typeof activeSession>(null);
  useEffect(() => { activeSessionRef.current = activeSession; }, [activeSession]);
  const timerRef = useRef<number | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const queueChannelRef = useRef<any>(null);
  const broadcastTimeoutRef = useRef<number | null>(null);

  // Active-host counter — use the same server-authoritative verified-online
  // pool that random-call fanout uses, so the number never drifts from who can
  // actually receive the ring.
  const refreshHostsCount = async () => {
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user?.id) return;
      const { data, error } = await supabase.rpc("get_online_global_hosts", {
        p_caller_id: u.user.id,
        p_limit: 1000,
      });
      if (error) throw error;
      setHostsCount(((data as any[]) ?? []).length);
    } catch { /* ignore */ }
  };

  // Keep the count fresh via Realtime + safety poll so the number never lags.
  useEffect(() => {
    void refreshHostsCount();
    const ch = supabase
      .channel(`match-call-live-count-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void refreshHostsCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "host_match_availability" }, () => {
        void refreshHostsCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "host_match_stats" }, () => {
        void refreshHostsCount();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "live_streams" }, () => {
        void refreshHostsCount();
      })
      .subscribe();
    const t = window.setInterval(() => { void refreshHostsCount(); }, 10000);
    return () => { supabase.removeChannel(ch); window.clearInterval(t); };
  }, []);

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("random_call_settings" as any).select("*").eq("id", 1).maybeSingle();
      setSettings(s);
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        const { data: p } = await supabase.from("profiles")
          .select("id, coins, diamonds, vip_tier, current_vip_tier_id").eq("id", u.user.id).maybeSingle();
        if (p) setProfile(p as any);
      }
      await refreshHostsCount();
    })();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
      if (broadcastTimeoutRef.current) window.clearTimeout(broadcastTimeoutRef.current);
      if (queueChannelRef.current) { try { supabase.removeChannel(queueChannelRef.current); } catch (_) {} }
      if (broadcastChannelRef.current) { try { supabase.removeChannel(broadcastChannelRef.current); } catch (_) {} }
    };
  }, []);

  // Instant-mode (pill tap): auto-fire broadcast as soon as settings load.
  const instantFiredRef = useRef(false);
  useEffect(() => {
    if (!instantMode || instantFiredRef.current) return;
    if (!settings) return;
    instantFiredRef.current = true;
    void startSearch(
      { preferred_langs: [], preferred_country: null, preferred_host_gender: "any" },
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
    const ping = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) return; // no session → skip; avoids 401 noise
        await supabase.functions.invoke("random-call-heartbeat", {
          body: {},
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* swallow */ }
    };
    ping();
    heartbeatRef.current = window.setInterval(ping, 15000);
    return () => {
      if (heartbeatRef.current) { window.clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, [phase]);

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
    if (queueChannelRef.current) {
      try { supabase.removeChannel(queueChannelRef.current); } catch (_) {}
      queueChannelRef.current = null;
    }
    if (broadcastTimeoutRef.current) {
      window.clearTimeout(broadcastTimeoutRef.current);
      broadcastTimeoutRef.current = null;
    }
    broadcastIdRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (instantMode) { navigate(-1); return; }
    setPhase("prep");
    setQueueId(null);
    setElapsed(0);
  };

  const cancelQueueInBackground = () => {
    const body: any = {};
    if (queueId) body.queue_id = queueId;
    if (broadcastIdRef.current) body.broadcast_id = broadcastIdRef.current;

    if (broadcastChannelRef.current) {
      try { supabase.removeChannel(broadcastChannelRef.current); } catch (_) {}
      broadcastChannelRef.current = null;
    }
    if (queueChannelRef.current) {
      try { supabase.removeChannel(queueChannelRef.current); } catch (_) {}
      queueChannelRef.current = null;
    }
    if (broadcastTimeoutRef.current) {
      window.clearTimeout(broadcastTimeoutRef.current);
      broadcastTimeoutRef.current = null;
    }
    broadcastIdRef.current = null;
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (heartbeatRef.current) {
      window.clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    setQueueId(null);
    setElapsed(0);

    if (body.queue_id || body.broadcast_id) {
      void supabase.functions.invoke("random-call-cancel", { body }).catch(() => {});
    }
  };

  const exitMatchCall = () => {
    cancelQueueInBackground();
    const canGoBack = Number(window.history.state?.idx ?? 0) > 0;
    if (canGoBack) navigate(-1);
    else navigate("/", { replace: true });
  };

  const openCallHistory = () => {
    cancelQueueInBackground();
    navigate("/call-history");
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
    if (queueChannelRef.current) { try { supabase.removeChannel(queueChannelRef.current); } catch (_) {} queueChannelRef.current = null; }
    if (broadcastChannelRef.current) { try { supabase.removeChannel(broadcastChannelRef.current); } catch (_) {} broadcastChannelRef.current = null; }
    if (broadcastTimeoutRef.current) { window.clearTimeout(broadcastTimeoutRef.current); broadcastTimeoutRef.current = null; }

    const maxRateForHold = Number(settings?.host_max_rate_coins_per_min ?? settings?.default_host_rate_coins_per_min ?? 0);
    const preauthMinutes = Number(settings?.preauth_minutes_hold ?? 0);
    const requiredBalance = Math.max(0, maxRateForHold * preauthMinutes);
    const currentBalance = await getBalanceWithFetch(true);
    if (requiredBalance > 0 && currentBalance < requiredBalance) {
      navigate("/recharge", { replace: true });
      return;
    }

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
      // Server may return structured non-2xx payloads (402/429).
      const errPayload: any = (data as any)?.error ? data : await extractEdgeFnErrorPayload(error);
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
      if (errPayload?.error === "insufficient_coins") {
        if (timerRef.current) window.clearInterval(timerRef.current);
        setPhase("prep");
        navigate("/recharge", { replace: true });
        return;
      }
      if (error) throw error;

      const handoff = async (sessionId: string, hostId: string) => {
        if (timerRef.current) window.clearInterval(timerRef.current);
        // Fetch matched host avatar so the centre orb freezes on their photo
        // before the full call screen opens (Chamet/Olamet-style reveal).
        try {
          const { data: hp } = await supabase
            .from("profiles")
            .select("avatar_url")
            .eq("id", hostId)
            .maybeSingle();
          setMatchedAvatarUrl((hp as any)?.avatar_url ?? null);
        } catch (_) { /* ignore */ }
        setPhase("matched");
        const startedAt = Date.now();
        const next = { session_id: sessionId, host_id: hostId, started_at: startedAt };
        setActiveSession(next);
        activeSessionRef.current = next;
        try {
          window.sessionStorage.setItem("random_call:active", JSON.stringify(next));
        } catch (_) {}
        // Brief reveal so the user sees the matched avatar settle before the
        // full call surface takes over (~600ms).
        await new Promise((r) => setTimeout(r, 600));
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
        broadcastTimeoutRef.current = window.setTimeout(async () => {
          if (broadcastIdRef.current !== bid) return;
          if (timerRef.current) window.clearInterval(timerRef.current);
          try { supabase.removeChannel(ch); } catch (_) {}
          broadcastChannelRef.current = null;
          broadcastIdRef.current = null;
          broadcastTimeoutRef.current = null;
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
                queueChannelRef.current = null;
                if (sess) await handoff(sid, (sess as any).host_id);
              }
            },
          ).subscribe();
        queueChannelRef.current = channel;
      } else {
        throw new Error((data as any)?.error ?? "Unknown response");
      }
    } catch (e: any) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      const payload = await extractEdgeFnErrorPayload(e);
      const code = payload?.error;
      if (code === "insufficient_coins") {
        setPhase("prep");
        navigate("/recharge", { replace: true });
        return;
      }
      if (code === "skip_cooldown") {
        const secs = payload?.cooldown_seconds_remaining ?? 0;
        toast.error(`You're skipping too fast. Try again in ${secs}s.`);
        setPhase("prep");
        return;
      }
      if (code === "daily_skip_limit_reached") {
        toast.error(`Daily skip limit reached (${payload?.daily_used}/${payload?.daily_limit}).`);
        setPhase("prep");
        return;
      }
      // Friendly mapping for all known server error codes.
      const friendly: Record<string, string> = {
        unauthorized: "Please sign in again to continue.",
        feature_disabled: "Random Call is temporarily disabled by admin. Please try later.",
        profile_not_found: "Your profile could not be loaded. Please reopen the app.",
        broadcast_insert_failed: "Could not start matching. Please try again.",
        queue_insert_failed: "Could not join the queue. Please try again.",
        session_insert_failed: "Match found but session could not start. Please retry.",
        internal_error: "Something went wrong on our side. Please try again.",
      };
      const msg = (code && friendly[code]) || friendly.internal_error;
      setErrorMsg(msg);
      setPhase("error");
    }
  };

  // Unified single UI for every non-incall phase.
  const estWait = hostsCount > 0
    ? Math.max(8, Math.min(60, Math.round(45 / Math.max(1, hostsCount))))
    : 45;
  const maxRate = Number(settings?.host_max_rate_coins_per_min ?? settings?.default_host_rate_coins_per_min ?? 0);
  const preauthMin = Number(settings?.preauth_minutes_hold ?? 2);
  const holdAmount = Math.max(0, maxRate * preauthMin);
  const profileBalance = Math.max(Number(profile?.coins ?? 0), Number(profile?.diamonds ?? 0));
  const profileIsVip = Number(profile?.vip_tier ?? 0) > 0 || !!profile?.current_vip_tier_id;

  return (
    <>
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
      <PreMatchPrep
        diamondBalance={profileBalance}
        hostRatePerMin={settings?.default_host_rate_coins_per_min ?? 500}
        requiredBalance={holdAmount}
        freeTrialSeconds={settings?.random_window_seconds ?? 60}
        minBillableSeconds={settings?.min_billable_seconds ?? 40}
        availableHostsCount={hostsCount}
        estimatedWaitSeconds={estWait}
        isVip={profileIsVip}
        countryRequiresVip={!!settings?.country_filter_requires_vip}
        genderFilterEnabled={!!settings?.enable_gender_filter}
        countryFilterEnabled={!!settings?.enable_country_filter}
        phase={phase}
        elapsedSeconds={elapsed}
        errorMsg={errorMsg}
        onCancel={cancelQueue}
        onRetry={() => {
          setErrorMsg("");
          setPhase("prep");
          void startSearch(
            lastFiltersRef.current ?? { preferred_langs: [], preferred_country: null, preferred_host_gender: "any" },
            { broadcast: true },
          );
        }}
        onStart={(filters) => startSearch(filters, { broadcast: true })}
        onBack={exitMatchCall}
        onHistory={openCallHistory}
        matchedAvatarUrl={matchedAvatarUrl}
      />
      <PostCallRatingSheet
        open={!!ratingSession}
        sessionId={ratingSession}
        onClose={closeRatingSheet}
      />
    </>
  );
}

