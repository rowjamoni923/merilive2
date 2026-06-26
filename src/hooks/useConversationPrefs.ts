/**
 * useConversationPrefs — per-user pin/mute/archive/mark-unread state for the
 * inbox, backed by `public.user_conversation_prefs`.
 *
 * Loaded once on mount, hot-updated via Supabase Realtime so any change
 * (other device, long-press menu) reflects instantly. Mutations are
 * optimistic — UI updates locally before the upsert round-trips.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ConversationPref {
  conversation_id: string;
  is_pinned: boolean;
  is_muted: boolean;
  is_archived: boolean;
  marked_unread: boolean;
  pinned_at: string | null;
}

type PrefMap = Record<string, ConversationPref>;

const empty = (cid: string): ConversationPref => ({
  conversation_id: cid,
  is_pinned: false,
  is_muted: false,
  is_archived: false,
  marked_unread: false,
  pinned_at: null,
});

export function useConversationPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<PrefMap>({});
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("user_conversation_prefs")
        .select("conversation_id,is_pinned,is_muted,is_archived,marked_unread,pinned_at")
        .eq("user_id", userId);
      if (cancelled || !data) return;
      const map: PrefMap = {};
      for (const row of data) map[row.conversation_id] = row as ConversationPref;
      setPrefs(map);
    })();

    const ch = supabase
      .channel(`ucp:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_conversation_prefs", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as ConversationPref | undefined;
          if (!row?.conversation_id) return;
          setPrefs((prev) => {
            const next = { ...prev };
            if (payload.eventType === "DELETE") delete next[row.conversation_id];
            else next[row.conversation_id] = row;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const update = useCallback(
    async (conversationId: string, patch: Partial<ConversationPref>) => {
      if (!userId) return;
      const current = prefsRef.current[conversationId] ?? empty(conversationId);
      const merged: ConversationPref = {
        ...current,
        ...patch,
        conversation_id: conversationId,
      };
      if (patch.is_pinned === true && !current.is_pinned) merged.pinned_at = new Date().toISOString();
      if (patch.is_pinned === false) merged.pinned_at = null;

      // optimistic
      setPrefs((p) => ({ ...p, [conversationId]: merged }));

      const { error } = await supabase
        .from("user_conversation_prefs")
        .upsert(
          {
            user_id: userId,
            conversation_id: conversationId,
            is_pinned: merged.is_pinned,
            is_muted: merged.is_muted,
            is_archived: merged.is_archived,
            marked_unread: merged.marked_unread,
            pinned_at: merged.pinned_at,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,conversation_id" },
        );

      if (error) {
        // rollback
        setPrefs((p) => ({ ...p, [conversationId]: current }));
      }
    },
    [userId],
  );

  return { prefs, update };
}
