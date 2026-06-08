import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Frown, Skull } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { memoryBus } from "@/lib/memoryBus";

/**
 * PK Battle Step 4 (P2 polish + P3 leak guards) — Punishment Overlay
 *
 * Renders a full-tile semi-transparent punishment treatment over the LOSING
 * host's video for the server-anchored `punishment_end_ts` window (industry
 * standard 60–120s, our default 90s — Bigo/Chamet/Poppo parity).
 *
 * Server-authoritative:
 *  - Reads `winner_user_id`, `final_status`, `punishment_end_ts` from
 *    `pk_battles` (single-row bounded Realtime subscription).
 *  - Component self-unmounts when timer hits 0 (via onComplete).
 *  - Pure UI — never writes any column.
 *
 * P3 leak guards:
 *  - HARD_CAP_MS (180s) — clamps any pathological `punishment_end_ts` so a bad
 *    server row can never strand the overlay + Realtime channel on the tile.
 *  - SEED_TIMEOUT_MS (12s) — if the row never delivers a `punishment_end_ts`
 *    (missing column / dropped Realtime), self-clear instead of leaking.
 *  - Memory pressure (critical/complete onTrimMemory) → immediate teardown.
 *  - All timers + the channel are stored in refs and torn down on unmount.
 */
const HARD_CAP_MS = 180_000; // 3 min absolute ceiling (industry max ~120s)
const SEED_TIMEOUT_MS = 12_000;

interface PKPunishmentOverlayProps {
  battleId: string;
  currentUserId: string;
  /** Auto-called when punishment window expires so parent can clear local state. */
  onComplete: () => void;
}

export const PKPunishmentOverlay = ({
  battleId,
  currentUserId,
  onComplete,
}: PKPunishmentOverlayProps) => {
  const [winnerUserId, setWinnerUserId] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<string | null>(null);
  const [endTs, setEndTs] = useState<number | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  // Latch onComplete so leak-guard callbacks don't depend on parent identity.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Seed + Realtime (+ seed timeout leak guard)
  useEffect(() => {
    let cancelled = false;
    const mountedAt = Date.now();
    const apply = (row: {
      winner_user_id?: string | null;
      final_status?: string | null;
      punishment_end_ts?: string | null;
    }) => {
      if (cancelled) return;
      if (row.winner_user_id !== undefined) setWinnerUserId(row.winner_user_id ?? null);
      if (row.final_status !== undefined) setFinalStatus(row.final_status ?? null);
      if (row.punishment_end_ts !== undefined) {
        const raw = row.punishment_end_ts ? new Date(row.punishment_end_ts).getTime() : null;
        if (raw && Number.isFinite(raw)) {
          // P3 hard cap: clamp pathological values (server bug, clock skew).
          const ceiling = mountedAt + HARD_CAP_MS;
          setEndTs(Math.min(raw, ceiling));
        } else {
          setEndTs(null);
        }
      }
    };

    (async () => {
      const { data } = await supabase
        .from("pk_battles")
        .select("winner_user_id, final_status, punishment_end_ts")
        .eq("id", battleId)
        .maybeSingle();
      if (data) apply(data);
    })();

    // guard-ok: pk-battle punishment overlay, single row filter, auto-cleanup
    const ch = supabase
      .channel(`pk_punish_${battleId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pk_battles", filter: `id=eq.${battleId}` },
        (payload) => apply(payload.new as Parameters<typeof apply>[0]),
      )
      .subscribe();

    // P3 seed timeout: if row never produced an endTs, release.
    const seedGuard = setTimeout(() => {
      if (cancelled) return;
      setEndTs((cur) => {
        if (cur == null) {
          // No server anchor → don't hold a Realtime channel forever.
          onCompleteRef.current?.();
        }
        return cur;
      });
    }, SEED_TIMEOUT_MS);

    // P3 memory pressure: drop overlay + channel under LMK pressure.
    const offMem = memoryBus.onUrgentTrim(() => {
      onCompleteRef.current?.();
    });

    return () => {
      cancelled = true;
      clearTimeout(seedGuard);
      offMem();
      supabase.removeChannel(ch);
    };
  }, [battleId]);

  // Countdown
  useEffect(() => {
    if (!endTs) return;
    const tick = () => {
      const remain = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
      setSecsLeft(remain);
      if (remain <= 0) onCompleteRef.current?.();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [endTs]);

  // Only loser sees the punishment treatment. Draws / forfeits → no overlay.
  const isLoser =
    !!winnerUserId &&
    winnerUserId !== currentUserId &&
    finalStatus !== "draw";

  if (!isLoser || secsLeft <= 0) return null;

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <AnimatePresence>
      <motion.div
        key="pk-punishment"
        className="absolute inset-0 z-40 pointer-events-none flex items-start justify-center pt-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Dim wash over loser tile */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, rgba(127,29,29,0.35) 0%, rgba(0,0,0,0.55) 60%, rgba(0,0,0,0.7) 100%)",
            backdropFilter: "saturate(60%) brightness(0.7)",
            WebkitBackdropFilter: "saturate(60%) brightness(0.7)",
          }}
        />
        {/* Diagonal warning stripes */}
        <div
          className="absolute inset-0 opacity-25"
          style={{
            background:
              "repeating-linear-gradient(45deg, rgba(239,68,68,0.45) 0 14px, transparent 14px 36px)",
          }}
        />

        <motion.div
          className="relative flex items-center gap-2 px-3.5 py-2 rounded-full"
          style={{
            background:
              "linear-gradient(135deg, rgba(127,29,29,0.92), rgba(76,5,25,0.92))",
            border: "1px solid rgba(252,165,165,0.55)",
            boxShadow:
              "0 10px 28px -6px rgba(239,68,68,0.55), 0 0 22px rgba(239,68,68,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
          animate={{ scale: [1, 1.04, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <motion.div
            animate={{ rotate: [0, -10, 10, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            style={{ filter: "drop-shadow(0 0 6px rgba(252,165,165,0.9))" }}
          >
            <Skull className="w-4 h-4 text-rose-200" />
          </motion.div>
          <span
            className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-rose-100"
            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.6)" }}
          >
            Punishment
          </span>
          <span
            className="font-mono text-sm font-extrabold tabular-nums text-white px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(0,0,0,0.35)",
              border: "1px solid rgba(255,255,255,0.12)",
              textShadow: "0 1px 2px rgba(0,0,0,0.6)",
            }}
          >
            {fmt(secsLeft)}
          </span>
          <Frown className="w-4 h-4 text-rose-200" />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
