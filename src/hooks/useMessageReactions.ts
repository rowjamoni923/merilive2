import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ReactionAgg = {
  emoji: string;
  count: number;
  mine: boolean;
  userIds: string[];
};

type Row = { message_id: string; user_id: string; emoji: string };

/**
 * Persistent message reactions with realtime sync + optimistic toggle.
 * Scoped to a conversation channel so we only stream relevant changes.
 */
export function useMessageReactions(opts: {
  currentUserId: string;
  conversationKey: string | null; // unique key for the active conversation/thread
  messageIds: string[];
}) {
  const { currentUserId, conversationKey, messageIds } = opts;
  const [byMessage, setByMessage] = useState<Record<string, ReactionAgg[]>>({});
  const rowsRef = useRef<Map<string, Row>>(new Map()); // key: msgId|userId|emoji

  const rebuild = useCallback(() => {
    const next: Record<string, Map<string, ReactionAgg>> = {};
    rowsRef.current.forEach((row) => {
      const m = (next[row.message_id] ??= new Map());
      const agg = m.get(row.emoji) ?? { emoji: row.emoji, count: 0, mine: false, userIds: [] };
      agg.count += 1;
      agg.userIds.push(row.user_id);
      if (row.user_id === currentUserId) agg.mine = true;
      m.set(row.emoji, agg);
    });
    const out: Record<string, ReactionAgg[]> = {};
    Object.entries(next).forEach(([mid, m]) => {
      out[mid] = Array.from(m.values()).sort((a, b) => b.count - a.count);
    });
    setByMessage(out);
  }, [currentUserId]);

  // Initial + incremental load when messageIds grow
  const loadedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = messageIds.filter((id) => id && !loadedIdsRef.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => loadedIdsRef.current.add(id));
    (async () => {
      const { data, error } = await supabase
        .from("message_reactions")
        .select("message_id,user_id,emoji")
        .in("message_id", fresh);
      if (error || !data) return;
      data.forEach((r: any) => {
        rowsRef.current.set(`${r.message_id}|${r.user_id}|${r.emoji}`, r as Row);
      });
      rebuild();
    })();
  }, [messageIds, rebuild]);

  // Reset cache when conversation changes
  useEffect(() => {
    rowsRef.current.clear();
    loadedIdsRef.current.clear();
    setByMessage({});
  }, [conversationKey]);

  // Realtime
  useEffect(() => {
    if (!conversationKey) return;
    const channel = supabase
      .channel(`msg-reactions:${conversationKey}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "message_reactions" },
        (payload: any) => {
          const r = payload.new as Row;
          if (!loadedIdsRef.current.has(r.message_id)) return;
          rowsRef.current.set(`${r.message_id}|${r.user_id}|${r.emoji}`, r);
          rebuild();
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "message_reactions" },
        (payload: any) => {
          const r = payload.old as Row;
          if (!r) return;
          rowsRef.current.delete(`${r.message_id}|${r.user_id}|${r.emoji}`);
          rebuild();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationKey, rebuild]);

  const toggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!currentUserId || !messageId || !emoji) return;
      const key = `${messageId}|${currentUserId}|${emoji}`;
      const had = rowsRef.current.has(key);
      // Optimistic
      if (had) rowsRef.current.delete(key);
      else rowsRef.current.set(key, { message_id: messageId, user_id: currentUserId, emoji });
      rebuild();
      try {
        if (had) {
          await supabase
            .from("message_reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", currentUserId)
            .eq("emoji", emoji);
        } else {
          const { error } = await supabase
            .from("message_reactions")
            .insert({ message_id: messageId, user_id: currentUserId, emoji });
          if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
            throw error;
          }
        }
      } catch (e) {
        // Rollback on failure
        if (had) rowsRef.current.set(key, { message_id: messageId, user_id: currentUserId, emoji });
        else rowsRef.current.delete(key);
        rebuild();
      }
    },
    [currentUserId, rebuild]
  );

  return { reactionsByMessage: byMessage, toggleReaction };
}
