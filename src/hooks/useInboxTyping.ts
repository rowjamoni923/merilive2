import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Inbox-wide typing indicator.
 *
 * Subscribes to a single broadcast channel keyed by the current user
 * (`inbox-typing:{userId}`). Whenever any peer is typing in a 1-to-1
 * conversation with this user, they emit `{ conversationId, fromUserId }`
 * into that channel. We hold each conversationId in a "typing" set for
 * ~3.5s, auto-clearing on silence.
 *
 * One channel per user — does NOT scale per-conversation. Cheap.
 */
export function useInboxTyping(currentUserId?: string | null) {
  const [typingSet, setTypingSet] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase.channel(`inbox-typing:${currentUserId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "typing" }, (payload: any) => {
      const convId: string | undefined = payload?.payload?.conversationId;
      const from: string | undefined = payload?.payload?.fromUserId;
      if (!convId || !from || from === currentUserId) return;

      setTypingSet((prev) => {
        if (prev.has(convId)) return prev;
        const next = new Set(prev);
        next.add(convId);
        return next;
      });

      const existing = timersRef.current.get(convId);
      if (existing) window.clearTimeout(existing);
      const t = window.setTimeout(() => {
        setTypingSet((prev) => {
          if (!prev.has(convId)) return prev;
          const next = new Set(prev);
          next.delete(convId);
          return next;
        });
        timersRef.current.delete(convId);
      }, 3500);
      timersRef.current.set(convId, t);
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
      setTypingSet(new Set());
    };
  }, [currentUserId]);

  return typingSet;
}

/**
 * Emit a typing ping to a peer's inbox channel. Call this alongside the
 * existing per-thread typing broadcast — once per ~1.5s while typing.
 */
export async function emitInboxTyping(params: {
  toUserId: string;
  fromUserId: string;
  conversationId: string;
}) {
  try {
    const ch = supabase.channel(`inbox-typing:${params.toUserId}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    await new Promise<void>((resolve) => {
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
      });
      window.setTimeout(resolve, 250);
    });
    await ch.send({
      type: "broadcast",
      event: "typing",
      payload: {
        conversationId: params.conversationId,
        fromUserId: params.fromUserId,
      },
    });
    // Tear down ephemeral sender channel after a tick to avoid leaking.
    window.setTimeout(() => {
      supabase.removeChannel(ch);
    }, 400);
  } catch {
    /* noop */
  }
}
