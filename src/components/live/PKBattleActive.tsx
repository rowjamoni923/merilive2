import { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Crown, Swords, Timer, Trophy, Frown } from "lucide-react";

/**
 * Bigo/Chamet-parity drawing lightning bolt for PK header.
 * stroke-dasharray + animated pathLength = energy-arc draw effect.
 */
const PKLightningBolt = ({ mirror = false }: { mirror?: boolean }) => (
  <motion.svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    style={{
      transform: mirror ? "scaleX(-1)" : undefined,
      filter: "drop-shadow(0 0 6px rgba(251,191,36,0.85)) drop-shadow(0 0 12px rgba(236,72,153,0.45))",
    }}
  >
    <motion.path
      d="M13 2 L4 14 L11 14 L9 22 L20 9 L13 9 Z"
      stroke="#fde68a"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="url(#pk-bolt-grad)"
      initial={{ pathLength: 0, opacity: 0.4 }}
      animate={{ pathLength: [0, 1, 1], opacity: [0.4, 1, 0.9] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut", times: [0, 0.5, 1] }}
    />
    <defs>
      <linearGradient id="pk-bolt-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#fef3c7" />
        <stop offset="55%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f97316" />
      </linearGradient>
    </defs>
  </motion.svg>
);

/**
 * Bigo-parity score number with Y-axis cross-fade slide (80ms) instead of
 * key-remount color flash. Eliminates score-blink during rapid gift bursts.
 */
const PKScoreNumber = ({
  value,
  color,
  glow,
}: {
  value: number;
  color: string;
  glow: string;
}) => (
  <span
    className="relative inline-block overflow-hidden text-lg font-extrabold tabular-nums"
    style={{ minWidth: "1.5em", height: "1.4em", lineHeight: "1.4em", color, textShadow: glow }}
  >
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={value}
        initial={{ y: "60%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        exit={{ y: "-60%", opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0 flex items-center justify-start"
      >
        {value}
      </motion.span>
    </AnimatePresence>
  </span>
);

import { useMobileOrientation } from "@/hooks/useMobileOrientation";
import { supabase } from "@/integrations/supabase/client";
// PK Battle Step 4: server distributes 70% winner bonus (beans) + sets
// mvp_user_id + punishment_end_ts. Client only renders these fields.
import type { GiftSentDetail } from "@/lib/livekitGiftSignaling";
import { usePKBattleSfx } from "@/hooks/usePKBattleSfx";
import { PKTopContributors } from "./PKTopContributors";


interface PKBattleActiveProps {
  battleId: string;
  isChallenger: boolean;
  challengerName: string;
  challengerAvatar: string;
  challengerLevel: number;
  challengerId?: string;
  opponentName: string;
  opponentAvatar: string;
  opponentLevel: number;
  opponentId?: string;
  /** Current viewer/host user id — drives native PK SFX/VAP/haptic cues. Optional. */
  currentUserId?: string | null;
  onBattleEnd: (winnerId: string | null) => void;
}

export const PKBattleActive = ({
  battleId,
  isChallenger: _isChallenger,
  challengerName,
  challengerAvatar,
  challengerLevel,
  challengerId,
  opponentName,
  opponentAvatar,
  opponentLevel,
  opponentId,
  currentUserId,
  onBattleEnd,
}: PKBattleActiveProps) => {
  const [challengerScore, setChallengerScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  const [serverStartedAt, setServerStartedAt] = useState<number | null>(null);
  const [serverDurationSec, setServerDurationSec] = useState<number>(300);
  const [timeLeft, setTimeLeft] = useState(0);
  const [battleEnded, setBattleEnded] = useState(false);
  // Step 4 — server-only fields surfaced for UI
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [mvpUserId, setMvpUserId] = useState<string | null>(null);
  const [mvpContribution, setMvpContribution] = useState<number | null>(null);
  const [mvpName, setMvpName] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const [punishmentEndTs, setPunishmentEndTs] = useState<number | null>(null);
  const [punishLeft, setPunishLeft] = useState(0);
  // Live floaters: 'score' (active-phase delta) + 'cheer' (punishment-phase
  // rescue gift). Auto-evicted after ~1.4s. Bigo-signature gift-feedback.
  type DeltaFloat = {
    key: string;
    side: "challenger" | "opponent";
    amount: number;
    kind: "score" | "cheer";
  };
  const [deltaFloats, setDeltaFloats] = useState<DeltaFloat[]>([]);

  const prevChallengerRef = useRef(0);
  const prevOpponentRef = useRef(0);
  const { isLandscape, isVerySmallHeight } = useMobileOrientation();
  const compact = isLandscape || isVerySmallHeight;


  // PK Battle Step 3 — REWORKED:
  //   1. Seed from server-authoritative columns (challenger_score, opponent_score,
  //      started_at, duration_seconds, status, winner_user_id, final_status).
  //   2. Supabase Realtime on the bounded pk_battles row delivers server-side
  //      score writes from bill_pk_gift() within ~200ms — no client writes.
  //   3. Own-room LiveKit gift event still gives a 0ms optimistic bump for the
  //      sender's HUD; the Realtime UPDATE reconciles to the server value shortly
  //      after, so transient over/under-counts heal automatically.
  //   4. Battle end is signalled by status='ended' + winner_user_id (uuid) set
  //      by the server pk-battle-tick cron — client NEVER writes status/winner.
  // P2 bundle — score-update coalescing. Burst gifting can produce dozens of
  // Realtime UPDATE events + LiveKit gift events in <100ms. We buffer the
  // latest known values into refs and flush at most once per animation frame
  // (~60Hz) so React renders + bar animations never flood the main thread.
  const pendingChallengerRef = useRef<number | null>(null);
  const pendingOpponentRef = useRef<number | null>(null);
  const flushScheduledRef = useRef(false);
  const scheduleFlush = useRef(() => {
    if (flushScheduledRef.current) return;
    flushScheduledRef.current = true;
    requestAnimationFrame(() => {
      flushScheduledRef.current = false;
      if (pendingChallengerRef.current !== null) {
        setChallengerScore(pendingChallengerRef.current);
        pendingChallengerRef.current = null;
      }
      if (pendingOpponentRef.current !== null) {
        setOpponentScore(pendingOpponentRef.current);
        pendingOpponentRef.current = null;
      }
    });
  }).current;

  useEffect(() => {
    if (battleEnded) return;
    let cancelled = false;

    const applyRow = (row: {
      challenger_score?: number | null;
      opponent_score?: number | null;
      started_at?: string | null;
      duration_seconds?: number | null;
      status?: string | null;
      winner_user_id?: string | null;
      final_status?: string | null;
      mvp_user_id?: string | null;
      mvp_contribution?: number | null;
      punishment_end_ts?: string | null;
    }) => {
      // Coalesced score updates (P2). Stash latest and flush on next frame.
      if (typeof row.challenger_score === "number") {
        pendingChallengerRef.current = row.challenger_score;
      }
      if (typeof row.opponent_score === "number") {
        pendingOpponentRef.current = row.opponent_score;
      }
      if (pendingChallengerRef.current !== null || pendingOpponentRef.current !== null) {
        scheduleFlush();
      }
      // Non-score fields are low-frequency — apply synchronously.
      if (row.started_at) setServerStartedAt(new Date(row.started_at).getTime());
      if (typeof row.duration_seconds === "number" && row.duration_seconds > 0) {
        setServerDurationSec(row.duration_seconds);
      }
      if (row.mvp_user_id !== undefined) setMvpUserId(row.mvp_user_id ?? null);
      if (row.mvp_contribution !== undefined) setMvpContribution(row.mvp_contribution ?? null);
      if (row.final_status !== undefined) setFinalStatus(row.final_status ?? null);
      if (row.punishment_end_ts !== undefined) {
        setPunishmentEndTs(row.punishment_end_ts ? new Date(row.punishment_end_ts).getTime() : null);
      }
      if (row.winner_user_id !== undefined) setWinnerUserId(row.winner_user_id ?? null);
      if (row.status === "ended") {
        setBattleEnded(true);
        onBattleEnd(row.winner_user_id ?? null);
      }
    };

    const seedBattle = async () => {
      const { data } = await supabase
        .from("pk_battles")
        .select(
          "challenger_score, opponent_score, started_at, duration_seconds, status, winner_user_id, final_status, mvp_user_id, mvp_contribution, punishment_end_ts",
        )
        .eq("id", battleId)
        .maybeSingle();
      if (cancelled || !data) return;
      applyRow(data);
    };
    seedBattle();

    // guard-ok: pk-battle row sync, single row filter, bounded by battle lifetime, auto-cleanup
    const channel = supabase
      .channel(`pk_battle_row_${battleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pk_battles", filter: `id=eq.${battleId}` },
        (payload) => {
          if (cancelled) return;
          applyRow(payload.new as Parameters<typeof applyRow>[0]);
        },
      )
      .subscribe();

    // 0ms optimistic UI bump from own-room LiveKit gift — server reconciles.
    // P2: optimistic bumps also go through the rAF buffer to share the throttle.
    const onLiveKitGift = (event: Event) => {
      const detail = (event as CustomEvent<GiftSentDetail>).detail;
      if (!detail) return;
      const coins = detail.totalCoins || (detail.giftCoins || 0) * (detail.count || 1);
      if (!coins) return;
      if (challengerId && detail.receiverId === challengerId) {
        const base = pendingChallengerRef.current ?? challengerScore;
        pendingChallengerRef.current = base + coins;
        scheduleFlush();
      } else if (opponentId && detail.receiverId === opponentId) {
        const base = pendingOpponentRef.current ?? opponentScore;
        pendingOpponentRef.current = base + coins;
        scheduleFlush();
      }
    };
    window.addEventListener("livekit-gift-sent", onLiveKitGift as EventListener);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.removeEventListener("livekit-gift-sent", onLiveKitGift as EventListener);
    };
  }, [battleId, battleEnded, challengerId, opponentId, onBattleEnd, challengerScore, opponentScore, scheduleFlush]);



  // PK Battle Step 3: derive timeLeft from server timestamps every second.
  // When timer hits 0, call request_pk_battle_end for instant server sync (R5 fix).
  useEffect(() => {
    if (battleEnded || !serverStartedAt) return;
    const endTs = serverStartedAt + serverDurationSec * 1000;
    const tick = () => {
      const remainMs = endTs - Date.now();
      setTimeLeft(Math.max(0, Math.ceil(remainMs / 1000)));
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [serverStartedAt, serverDurationSec, battleEnded]);

  // R5: when client timer reaches 0, nudge the server to end immediately
  // instead of waiting for the 10s cron tick.
  const hasRequestedEndRef = useRef(false);
  useEffect(() => {
    if (timeLeft === 0 && battleId && !battleEnded && !hasRequestedEndRef.current) {
      hasRequestedEndRef.current = true;
      (async () => {
        try {
          const { data, error } = await supabase.rpc("request_pk_battle_end", { p_battle_id: battleId });
          if (error) console.warn("[PK] request_pk_battle_end failed:", error);
          else if (data?.ok) console.log("[PK] request_pk_battle_end:", data);
          else console.log("[PK] request_pk_battle_end declined:", data?.reason);
        } catch (e) {
          console.warn("[PK] request_pk_battle_end exception:", e);
        }
      })();
    }
  }, [timeLeft, battleId, battleEnded]);

  // Step 4: punishment countdown for the loser side (server-anchored).
  // P3 leak guard: clamp pathological `punishment_end_ts` values (server bug
  // or clock skew) so the local interval cannot tick forever on the HUD.
  useEffect(() => {
    if (!punishmentEndTs) {
      setPunishLeft(0);
      return;
    }
    const HARD_CAP_MS = 180_000; // industry max ~120s, ceiling 180s
    const ceiling = Date.now() + HARD_CAP_MS;
    const effectiveEnd = Math.min(punishmentEndTs, ceiling);
    const tick = () => {
      const remainMs = effectiveEnd - Date.now();
      setPunishLeft(Math.max(0, Math.ceil(remainMs / 1000)));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [punishmentEndTs]);


  // Native Android polish: SFX / VAP / haptics for battle_start, countdown,
  // time_up, victory, defeat, punishment sticker. Pure side-effect — no UI.
  usePKBattleSfx({
    battleId,
    currentUserId: currentUserId ?? null,
    challengerId,
    opponentId,
    status: battleEnded ? "ended" : serverStartedAt ? "active" : "pending",
    timeLeft,
    winnerUserId,
    finalStatus,
    punishmentEndTs,
  });

  // P1 bundle — loser audio mute during punishment window (industry standard).
  // When this client is the loser host, dispatch a window event so LiveStream
  // mutes our mic until `punishment_end_ts`. Viewer clients ignore (no mic).
  useEffect(() => {
    if (!battleEnded || !winnerUserId || !punishmentEndTs || !currentUserId) return;
    if (currentUserId !== challengerId && currentUserId !== opponentId) return; // viewer
    if (currentUserId === winnerUserId) return; // winner
    const msLeft = punishmentEndTs - Date.now();
    if (msLeft <= 0) return;
    window.dispatchEvent(
      new CustomEvent("pk:loser-mic", { detail: { muted: true, durationMs: msLeft, battleId } })
    );
    const t = setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("pk:loser-mic", { detail: { muted: false, battleId } })
      );
    }, msLeft);
    return () => clearTimeout(t);
  }, [battleEnded, winnerUserId, punishmentEndTs, currentUserId, challengerId, opponentId, battleId]);


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const totalScore = challengerScore + opponentScore;
  const challengerPercent = totalScore > 0 ? (challengerScore / totalScore) * 100 : 50;
  const opponentPercent = totalScore > 0 ? (opponentScore / totalScore) * 100 : 50;

  /** Compact raw-count formatter (Bigo-parity: 1,234 → 12.3K above HP half). */
  const fmtCompact = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` :
    n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` :
    n.toLocaleString();

  const challengerWinning = challengerScore > opponentScore;
  const opponentWinning = opponentScore > challengerScore;

  const timeUrgent = timeLeft <= 30;
  const timeCritical = timeLeft <= 10 && timeLeft > 0;
  const timeShatter = timeLeft === 0 && !!serverStartedAt && !battleEnded;

  // Sudden-Death: last 30s + scores within ±10% of midline (Bigo "FINAL PUSH").
  const suddenDeath =
    !battleEnded && timeLeft > 0 && timeLeft <= 30 &&
    totalScore > 0 && Math.abs(challengerPercent - opponentPercent) <= 20;

  // Punishment-phase: dim & lock both halves, loser side gets red wash.
  const inPunishment = battleEnded && punishLeft > 0 && !!winnerUserId;
  const challengerLost = inPunishment && winnerUserId === opponentId;
  const opponentLost = inPunishment && winnerUserId === challengerId;

  // Live diamond-delta float-up: detect server score increases and emit a
  // transient `+N` floater anchored over the matching HP half.
  useEffect(() => {
    const cDelta = challengerScore - prevChallengerRef.current;
    const oDelta = opponentScore - prevOpponentRef.current;
    prevChallengerRef.current = challengerScore;
    prevOpponentRef.current = opponentScore;
    if (cDelta <= 0 && oDelta <= 0) return;
    const adds: DeltaFloat[] = [];
    const stamp = Date.now();
    if (cDelta > 0) adds.push({ key: `c-${stamp}-${Math.random().toString(36).slice(2, 6)}`, side: "challenger", amount: cDelta });
    if (oDelta > 0) adds.push({ key: `o-${stamp}-${Math.random().toString(36).slice(2, 6)}`, side: "opponent", amount: oDelta });
    if (!adds.length) return;
    setDeltaFloats((prev) => [...prev, ...adds].slice(-8));
    const keys = adds.map((a) => a.key);
    const t = setTimeout(() => {
      setDeltaFloats((prev) => prev.filter((f) => !keys.includes(f.key)));
    }, 1400);
    return () => clearTimeout(t);
  }, [challengerScore, opponentScore]);

  // Resolve MVP display name. Cheap: if MVP is one of the hosts, reuse name;
  // otherwise fire a single profiles SELECT.
  useEffect(() => {
    if (!mvpUserId) { setMvpName(null); return; }
    if (mvpUserId === challengerId) { setMvpName(challengerName); return; }
    if (mvpUserId === opponentId) { setMvpName(opponentName); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, display_name")
        .eq("user_id", mvpUserId)
        .maybeSingle();
      if (cancelled) return;
      const n = (data as any)?.display_name || (data as any)?.username || null;
      setMvpName(n);
    })();
    return () => { cancelled = true; };
  }, [mvpUserId, challengerId, opponentId, challengerName, opponentName]);



  return (
    <motion.div
      className={`absolute left-0 right-0 z-30 px-3 ${compact ? "top-2 mx-auto max-w-xl" : "top-24"}`}
      initial={{ y: -50, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      transition={{ type: "spring", damping: 24, stiffness: 320 }}
    >
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, rgba(76,29,149,0.92) 0%, rgba(131,24,67,0.92) 50%, rgba(76,29,149,0.92) 100%)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.14)",
          boxShadow:
            "0 18px 40px -12px rgba(236,72,153,0.45), 0 6px 20px -8px rgba(168,85,247,0.4), inset 0 1px 0 rgba(255,255,255,0.16)",
        }}
      >
        {/* Battle aurora overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 0% 0%, rgba(236,72,153,0.22) 0%, transparent 55%), radial-gradient(120% 80% at 100% 100%, rgba(168,85,247,0.22) 0%, transparent 55%)",
          }}
        />
        {/* Shine sweep */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.12) 50%, transparent 65%)",
            mixBlendMode: "overlay",
            animation: "giftSendShine 4.2s ease-in-out infinite",
          }}
        />

        {/* Timer and Title */}
        <div
          className="relative flex items-center justify-center gap-2 py-2"
          style={{
            background:
              "linear-gradient(90deg, rgba(236,72,153,0.22) 0%, rgba(168,85,247,0.22) 100%)",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <PKLightningBolt />
          <span
            className="font-extrabold text-sm tracking-wide"
            style={{
              background: "linear-gradient(90deg, #fff 0%, #fde68a 50%, #fff 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 0 12px rgba(251,191,36,0.3)",
            }}
          >
            PK BATTLE
          </span>
          <motion.div
            className="flex items-center gap-1 rounded-full px-2 py-0.5"
            style={{
              background: timeUrgent
                ? "linear-gradient(135deg, rgba(239,68,68,0.5), rgba(220,38,38,0.4))"
                : "rgba(0,0,0,0.35)",
              border: timeUrgent ? "1px solid rgba(252,165,165,0.5)" : "1px solid rgba(255,255,255,0.08)",
              boxShadow: timeUrgent ? "0 0 14px rgba(239,68,68,0.5)" : "none",
            }}
            animate={
              timeShatter
                ? { scale: [1, 1.6, 0.4], opacity: [1, 0.9, 0], filter: ["blur(0px)", "blur(2px)", "blur(8px)"] }
                : timeCritical
                  ? { scale: [1, 1.18, 1] }
                  : timeUrgent
                    ? { scale: [1, 1.06, 1] }
                    : { scale: 1 }
            }
            transition={
              timeShatter
                ? { duration: 0.6, ease: "easeOut" }
                : { duration: timeCritical ? 0.55 : 1, repeat: Infinity, ease: "easeInOut" }
            }
          >
            <Timer className={`w-3 h-3 ${timeUrgent ? "text-rose-200" : "text-amber-400"}`} />
            <span className={`font-mono text-sm tabular-nums font-bold ${timeUrgent ? "text-rose-100" : "text-amber-300"}`}>
              {formatTime(timeLeft)}
            </span>
          </motion.div>
          <PKLightningBolt mirror />
        </div>

        {/* VS Section */}
        <div className={compact ? "relative p-2" : "relative p-3"}>
          <div className={`flex items-center justify-between ${compact ? "gap-1.5" : "gap-2"}`}>
            {/* Challenger */}
            <div className="flex-1 flex items-center gap-2">
              <div className="relative">
                <motion.div
                  className={`${compact ? "w-9 h-9" : "w-12 h-12"} rounded-full overflow-hidden`}
                  style={{
                    border: challengerWinning ? "2px solid #fbbf24" : "2px solid #ec4899",
                    boxShadow: challengerWinning
                      ? "0 0 0 3px rgba(251,191,36,0.35), 0 0 18px rgba(251,191,36,0.6), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "0 0 0 2px rgba(236,72,153,0.35), 0 0 14px rgba(236,72,153,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                  animate={challengerWinning ? { scale: [1, 1.06, 1] } : {}}
                  transition={{ duration: 0.7, repeat: Infinity }}
                >
                  <img loading="lazy" decoding="async" 
                    src={challengerAvatar || "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150"}
                    alt={challengerName}
                    className="w-full h-full object-cover" />
                </motion.div>
                {challengerWinning && (
                  <motion.div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                    initial={{ y: 4, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.9))" }}
                  >
                    <Crown className="w-4 h-4 text-amber-400" />
                  </motion.div>
                )}
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-[6px] font-extrabold text-black"
                  style={{
                    background: "linear-gradient(135deg, #fbbf24, #d97706)",
                    boxShadow: "0 0 8px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                  }}
                >
                  Lv{challengerLevel}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                  {challengerName}
                </p>
                <div className="flex items-baseline gap-1 mt-0.5">
                  <PKScoreNumber
                    value={challengerScore}
                    color="#fbbf24"
                    glow="0 0 10px rgba(251,191,36,0.5)"
                  />
                  <span className="text-white/70 text-[10px]">diamonds</span>
                </div>
              </div>
            </div>

            {/* VS Badge — pulsing heartbeat (replaces rotating spinner) */}
            <motion.div
              className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #ef4444, #ec4899)",
                boxShadow:
                  "0 0 0 2px rgba(255,255,255,0.22), 0 0 18px rgba(239,68,68,0.7), 0 0 36px rgba(236,72,153,0.45), inset 0 1px 0 rgba(255,255,255,0.32)",
              }}
              animate={{ scale: [1, 1.12, 1] }}
              transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
            >
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: "2px solid rgba(252,165,165,0.7)" }}
                animate={{ scale: [1, 1.6, 1.8], opacity: [0.85, 0.3, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              />
              <span
                className="relative text-white font-extrabold text-xs"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.45)" }}
              >
                VS
              </span>
            </motion.div>


            {/* Opponent */}
            <div className="flex-1 flex items-center gap-2 flex-row-reverse">
              <div className="relative">
                <motion.div
                  className={`${compact ? "w-9 h-9" : "w-12 h-12"} rounded-full overflow-hidden`}
                  style={{
                    border: opponentWinning ? "2px solid #fbbf24" : "2px solid #a855f7",
                    boxShadow: opponentWinning
                      ? "0 0 0 3px rgba(251,191,36,0.35), 0 0 18px rgba(251,191,36,0.6), inset 0 1px 0 rgba(255,255,255,0.2)"
                      : "0 0 0 2px rgba(168,85,247,0.35), 0 0 14px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                  animate={opponentWinning ? { scale: [1, 1.06, 1] } : {}}
                  transition={{ duration: 0.7, repeat: Infinity }}
                >
                  <img loading="lazy" decoding="async" 
                    src={opponentAvatar || "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150"}
                    alt={opponentName}
                    className="w-full h-full object-cover" />
                </motion.div>
                {opponentWinning && (
                  <motion.div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2"
                    initial={{ y: 4, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    style={{ filter: "drop-shadow(0 0 6px rgba(251,191,36,0.9))" }}
                  >
                    <Crown className="w-4 h-4 text-amber-400" />
                  </motion.div>
                )}
                <div
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded text-[6px] font-extrabold text-black"
                  style={{
                    background: "linear-gradient(135deg, #fbbf24, #d97706)",
                    boxShadow: "0 0 8px rgba(251,191,36,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
                  }}
                >
                  Lv{opponentLevel}
                </div>
              </div>
              <div className="flex-1 min-w-0 text-right">
                <p className="text-white text-xs font-semibold truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                  {opponentName}
                </p>
                <div className="flex items-baseline gap-1 mt-0.5 justify-end">
                  <span className="text-white/70 text-[10px]">diamonds</span>
                  <PKScoreNumber
                    value={opponentScore}
                    color="#c084fc"
                    glow="0 0 10px rgba(168,85,247,0.55)"
                  />
                </div>

              </div>
            </div>
          </div>

          {/* Progress Bar + sliding lead crown (Bigo-parity) */}
          <div className="relative mt-3">
            {/* Sudden-Death "FINAL PUSH" banner — last 30s + close score */}
            <AnimatePresence>
              {suddenDeath && (
                <motion.div
                  key="sudden-death"
                  className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full z-20"
                  initial={{ scale: 0, y: 6, opacity: 0 }}
                  animate={{ scale: [0, 1.15, 1], y: 0, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ type: "spring", damping: 16, stiffness: 320 }}
                  style={{
                    background: "linear-gradient(135deg, #ef4444 0%, #f97316 50%, #fbbf24 100%)",
                    border: "1px solid rgba(254,243,199,0.7)",
                    boxShadow:
                      "0 0 14px rgba(239,68,68,0.7), 0 0 28px rgba(251,191,36,0.4), inset 0 1px 0 rgba(255,255,255,0.35)",
                  }}
                >
                  <motion.span
                    className="text-[10px] font-black tracking-[0.2em] text-white uppercase block"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
                    animate={{ scale: [1, 1.08, 1] }}
                    transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                  >
                    Final Push
                  </motion.span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Diamond-delta floaters per side (Bigo-signature +N rise+fade) */}
            <div className="pointer-events-none absolute -top-4 left-0 right-0 h-6 z-10 overflow-visible">
              <AnimatePresence>
                {deltaFloats.map((f) => (
                  <motion.div
                    key={f.key}
                    className="absolute text-[11px] font-black tabular-nums"
                    style={{
                      left: f.side === "challenger" ? "20%" : "80%",
                      transform: "translateX(-50%)",
                      color: f.side === "challenger" ? "#fbcfe8" : "#e9d5ff",
                      textShadow:
                        f.side === "challenger"
                          ? "0 0 8px rgba(236,72,153,0.9), 0 1px 2px rgba(0,0,0,0.6)"
                          : "0 0 8px rgba(168,85,247,0.9), 0 1px 2px rgba(0,0,0,0.6)",
                    }}
                    initial={{ y: 6, opacity: 0, scale: 0.7 }}
                    animate={{ y: -22, opacity: [0, 1, 1, 0], scale: [0.7, 1.15, 1, 0.9] }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.3, ease: "easeOut", times: [0, 0.2, 0.7, 1] }}
                  >
                    +{fmtCompact(f.amount)} 💎
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Raw count micro-text above each half */}
            <div className="flex justify-between mb-0.5 px-0.5">
              <span className="text-[10px] font-bold text-pink-300 tabular-nums" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                {fmtCompact(challengerScore)}
              </span>
              <span className="text-[10px] font-bold text-purple-300 tabular-nums" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                {fmtCompact(opponentScore)}
              </span>
            </div>
            {totalScore > 0 && (
              <motion.div
                className="pointer-events-none absolute -top-3 z-10"
                style={{
                  left: `${challengerPercent}%`,
                  transform: "translateX(-50%)",
                  filter: "drop-shadow(0 0 6px rgba(251,191,36,0.95)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))",
                }}
                animate={{ left: `${challengerPercent}%` }}
                transition={{ type: "spring", damping: 22, stiffness: 180 }}
              >
                <Crown className="w-3.5 h-3.5 text-amber-300" />
              </motion.div>
            )}
            <div
              className="relative h-2.5 rounded-full overflow-hidden flex"
              style={{
                background: "rgba(0,0,0,0.4)",
                boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.06)",
                filter: inPunishment ? "saturate(0.6) brightness(0.85)" : undefined,
              }}
            >
              <motion.div
                className="h-full relative"
                style={{
                  background: "linear-gradient(90deg, #f472b6 0%, #ec4899 100%)",
                  boxShadow: "0 0 10px rgba(236,72,153,0.7)",
                }}
                initial={{ width: "50%" }}
                animate={{ width: `${challengerPercent}%` }}
                transition={{ type: "spring", damping: 18, stiffness: 140 }}
              >
                {challengerWinning && totalScore > 0 && !inPunishment && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.75) 50%, transparent 70%)",
                      animation: "giftSendShine 1.4s ease-in-out infinite",
                      mixBlendMode: "screen",
                    }}
                  />
                )}
                {challengerLost && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, rgba(239,68,68,0.55) 0 6px, rgba(0,0,0,0.35) 6px 12px)",
                      mixBlendMode: "multiply",
                    }}
                  />
                )}
              </motion.div>
              <motion.div
                className="h-full relative"
                style={{
                  background: "linear-gradient(90deg, #a855f7 0%, #c084fc 100%)",
                  boxShadow: "0 0 10px rgba(168,85,247,0.7)",
                }}
                initial={{ width: "50%" }}
                animate={{ width: `${opponentPercent}%` }}
                transition={{ type: "spring", damping: 18, stiffness: 140 }}
              >
                {opponentWinning && totalScore > 0 && !inPunishment && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.75) 50%, transparent 70%)",
                      animation: "giftSendShine 1.4s ease-in-out infinite",
                      mixBlendMode: "screen",
                    }}
                  />
                )}
                {opponentLost && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "repeating-linear-gradient(45deg, rgba(239,68,68,0.55) 0 6px, rgba(0,0,0,0.35) 6px 12px)",
                      mixBlendMode: "multiply",
                    }}
                  />
                )}
              </motion.div>

              {/* Center divider glow follows leader split */}
              <motion.div
                className="pointer-events-none absolute top-0 bottom-0 w-px"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  boxShadow: "0 0 6px rgba(255,255,255,0.9)",
                  transform: "translateX(-0.5px)",
                }}
                animate={{ left: `${challengerPercent}%` }}
                transition={{ type: "spring", damping: 22, stiffness: 180 }}
              />
            </div>

            {/* Top-3 supporter avatars per side (Bigo/Chamet parity) */}
            <PKTopContributors
              battleId={battleId}
              challengerId={challengerId}
              opponentId={opponentId}
            />
          </div>


        </div>


        {/* Step 4: Winner / Draw / Punishment overlay */}
        <AnimatePresence>
          {battleEnded && (
            <motion.div
              key="pk-result"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", damping: 22, stiffness: 280 }}
              className="absolute inset-x-2 top-1 z-20 rounded-2xl px-3 py-2.5 flex items-center justify-between gap-3"
              style={{
                background:
                  "linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(76,29,149,0.92) 100%)",
                border: "1px solid rgba(251,191,36,0.45)",
                boxShadow:
                  "0 14px 36px -10px rgba(251,191,36,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
                backdropFilter: "blur(14px) saturate(140%)",
                WebkitBackdropFilter: "blur(14px) saturate(140%)",
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {winnerUserId ? (
                  <motion.div
                    animate={{ rotate: [0, -8, 8, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                    style={{ filter: "drop-shadow(0 0 10px rgba(251,191,36,0.9))" }}
                  >
                    <Trophy className="w-6 h-6 text-amber-400" />
                  </motion.div>
                ) : (
                  <Swords className="w-6 h-6 text-white/70" />
                )}
                <div className="min-w-0">
                  <p
                    className="text-[10px] uppercase tracking-widest text-amber-300/90 font-semibold"
                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
                  >
                    {finalStatus === "draw"
                      ? "Draw"
                      : finalStatus === "forfeit_left" || finalStatus === "forfeit_disconnect"
                        ? "Forfeit"
                        : "Winner"}
                  </p>
                  <p className="text-white text-sm font-extrabold truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                    {winnerUserId === challengerId
                      ? challengerName
                      : winnerUserId === opponentId
                        ? opponentName
                        : "—"}
                  </p>
                </div>
              </div>

              {mvpUserId && (
                <div className="flex flex-col items-center gap-0.5 px-2 py-1 rounded-full shrink-0">
                  <div
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                    style={{
                      background: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(217,119,6,0.25))",
                      border: "1px solid rgba(251,191,36,0.55)",
                      boxShadow: "0 0 12px rgba(251,191,36,0.35)",
                    }}
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-300" />
                    <span className="text-[10px] font-extrabold tracking-wider text-amber-200">MVP</span>
                  </div>
                  {mvpName && (
                    <span className="text-[10px] font-bold text-amber-100 truncate max-w-[90px]" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}>
                      {mvpName}
                    </span>
                  )}
                  {typeof mvpContribution === "number" && mvpContribution > 0 && (
                    <span className="text-[9px] font-semibold text-amber-300/90 tabular-nums" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}>
                      {fmtCompact(mvpContribution)} coins
                    </span>
                  )}

                </div>
              )}

              {punishLeft > 0 && winnerUserId && (
                <motion.div
                  className="flex items-center gap-1 px-2 py-1 rounded-full shrink-0"
                  style={{
                    background: "linear-gradient(135deg, rgba(239,68,68,0.35), rgba(220,38,38,0.25))",
                    border: "1px solid rgba(252,165,165,0.5)",
                    boxShadow: "0 0 12px rgba(239,68,68,0.45)",
                  }}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                >
                  <Frown className="w-3.5 h-3.5 text-rose-200" />
                  <span className="font-mono text-xs tabular-nums font-bold text-rose-100">
                    {formatTime(punishLeft)}
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
