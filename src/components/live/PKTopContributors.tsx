/**
 * PKTopContributors — Bigo/Chamet-parity Top-3 supporter avatars per side.
 *
 * - Initial aggregate via `pk_battle_gifts` SELECT (sums score_value per sender per side).
 * - Realtime INSERT subscription on the same table (filter battle_id=...) keeps
 *   the leaderboard live without polling.
 * - Resolves sender profile (avatar_url, display_name/username) lazily and
 *   caches in a ref so repeat gifts don't re-fetch.
 * - Pure presentation; no client writes.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Crown } from "lucide-react";

interface Props {
  battleId: string;
  challengerId?: string;
  opponentId?: string;
}

interface SenderRow {
  senderId: string;
  score: number;
}

interface PKGiftRow {
  sender_id?: string | null;
  target_host_id?: string | null;
  score_value?: number | string | null;
}

interface ResolvedSender extends SenderRow {
  avatar: string | null;
  name: string;
}

const TOP_N = 3;

export const PKTopContributors = ({ battleId, challengerId, opponentId }: Props) => {
  // Per-side sender → score totals
  const challengerMapRef = useRef<Map<string, number>>(new Map());
  const opponentMapRef = useRef<Map<string, number>>(new Map());
  const profileCacheRef = useRef<Map<string, { avatar: string | null; name: string }>>(new Map());
  const [tick, setTick] = useState(0);
  const [profilesVersion, setProfilesVersion] = useState(0);

  const bump = () => setTick((n) => n + 1);

  const applyGift = (row: PKGiftRow) => {
    const senderId = row.sender_id;
    const target = row.target_host_id;
    const score = Number(row.score_value) || 0;
    if (!senderId || !target || score <= 0) return;
    const map =
      target === challengerId ? challengerMapRef.current :
      target === opponentId ? opponentMapRef.current : null;
    if (!map) return;
    map.set(senderId, (map.get(senderId) || 0) + score);
  };

  // Initial fetch + Realtime
  useEffect(() => {
    if (!battleId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("pk_battle_gifts")
        .select("sender_id, target_host_id, score_value")
        .eq("battle_id", battleId);
      if (cancelled || !data) return;
      challengerMapRef.current.clear();
      opponentMapRef.current.clear();
      profileCacheRef.current.clear();
      for (const row of data) applyGift(row);
      bump();
    })();

    const channel = supabase
      .channel(`pk_top_${battleId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pk_battle_gifts", filter: `battle_id=eq.${battleId}` },
        (payload) => {
          if (cancelled) return;
          applyGift(payload.new as PKGiftRow);
          bump();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleId, challengerId, opponentId]);

  // Derive top-N per side
  const topChallenger = useMemo<SenderRow[]>(() => {
    return Array.from(challengerMapRef.current.entries())
      .map(([senderId, score]) => ({ senderId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const topOpponent = useMemo<SenderRow[]>(() => {
    return Array.from(opponentMapRef.current.entries())
      .map(([senderId, score]) => ({ senderId, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Lazy profile resolution for any new sender ids in the top lists
  useEffect(() => {
    const need = new Set<string>();
    for (const r of [...topChallenger, ...topOpponent]) {
      if (!profileCacheRef.current.has(r.senderId)) need.add(r.senderId);
    }
    if (need.size === 0) return;
    let cancelled = false;
    (async () => {
      const ids = Array.from(need);
      const { data } = await supabase
        .from("profiles")
        .select("id, avatar_url, display_name, username")
        .in("id", ids);
      if (cancelled || !data) return;
      for (const p of data) {
        profileCacheRef.current.set(p.id, {
          avatar: p.avatar_url || null,
          name: p.display_name || p.username || "User",
        });
      }
      // Fill blanks for ids not returned (deleted / missing profile)
      for (const id of ids) {
        if (!profileCacheRef.current.has(id)) {
          profileCacheRef.current.set(id, { avatar: null, name: "User" });
        }
      }
      setProfilesVersion((n) => n + 1);
    })();
    return () => { cancelled = true; };
  }, [topChallenger, topOpponent]);

  const left = useMemo<ResolvedSender[]>(() =>
    topChallenger.map((r) => {
      const p = profileCacheRef.current.get(r.senderId);
      return { ...r, avatar: p?.avatar ?? null, name: p?.name ?? "User" };
    }), [topChallenger, profilesVersion]);

  const right = useMemo<ResolvedSender[]>(() =>
    topOpponent.map((r) => {
      const p = profileCacheRef.current.get(r.senderId);
      return { ...r, avatar: p?.avatar ?? null, name: p?.name ?? "User" };
    }), [topOpponent, profilesVersion]);

  if (left.length === 0 && right.length === 0) return null;

  return (
    <div className="relative mt-2 flex items-start justify-between gap-2 px-0.5">
      <SideRow side="left" rows={left} accent="#ec4899" />
      <SideRow side="right" rows={right} accent="#a855f7" />
    </div>
  );
};

const SideRow = ({
  side,
  rows,
  accent,
}: {
  side: "left" | "right";
  rows: ResolvedSender[];
  accent: string;
}) => {
  return (
    <div className={`flex items-center gap-0.5 ${side === "right" ? "flex-row-reverse" : ""}`}>
      <AnimatePresence initial={false}>
        {rows.map((r, idx) => (
          <motion.div
            key={r.senderId}
            layout
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", damping: 18, stiffness: 320 }}
            className="relative"
            style={{
              marginLeft: side === "left" && idx > 0 ? -6 : 0,
              marginRight: side === "right" && idx > 0 ? -6 : 0,
              zIndex: TOP_N - idx,
            }}
          >
            <div
              className="w-5 h-5 rounded-full overflow-hidden bg-black/40"
              style={{
                border: idx === 0 ? `1.5px solid #fbbf24` : `1px solid ${accent}`,
                boxShadow:
                  idx === 0
                    ? "0 0 6px rgba(251,191,36,0.7), inset 0 1px 0 rgba(255,255,255,0.25)"
                    : `0 0 4px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.18)`,
              }}
            >
              {r.avatar ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={r.avatar}
                  alt={r.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[8px] font-bold text-white/80">
                  {r.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {idx === 0 && (
              <Crown
                className="absolute -top-2 left-1/2 -translate-x-1/2 w-2.5 h-2.5 text-amber-300"
                style={{ filter: "drop-shadow(0 0 3px rgba(251,191,36,0.9))" }}
              />
            )}
            <span
              className="absolute -bottom-1 -right-1 text-[7px] font-extrabold rounded-full px-1 leading-tight text-black"
              style={{
                background: idx === 0 ? "linear-gradient(135deg,#fde68a,#f59e0b)" : "rgba(255,255,255,0.85)",
                textShadow: "0 1px 0 rgba(255,255,255,0.4)",
              }}
            >
              {idx + 1}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default PKTopContributors;
