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
 * Sender-side channel cache: one cached broadcast channel per peer user.
 * Reused across typing pings so we don't spawn/teardown a channel each ping.
 * Auto-evict after 60s of inactivity to keep the realtime quota tiny.
 */
const senderCache = new Map<
  string,
  { channel: ReturnType<typeof supabase.channel>; lastUsed: number; ready: Promise<void> }
>();

function getSenderChannel(toUserId: string) {
  const now = Date.now();
  // Evict stale (>60s idle) entries first.
  for (const [k, v] of senderCache) {
    if (now - v.lastUsed > 60_000) {
      try { supabase.removeChannel(v.channel); } catch { /* noop */ }
      senderCache.delete(k);
    }
  }
  const hit = senderCache.get(toUserId);
  if (hit) {
    hit.lastUsed = now;
    return hit;
  }
  const channel = supabase.channel(`inbox-typing:${toUserId}`, {
    config: { broadcast: { self: false, ack: false } },
  });
  const ready = new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
    });
    window.setTimeout(resolve, 400);
  });
  const entry = { channel, lastUsed: now, ready };
  senderCache.set(toUserId, entry);
  return entry;
}

/**
 * Emit a typing ping to a peer's inbox channel. Call this alongside the
 * existing per-thread typing broadcast — throttle to ~once per 1.5s while typing.
 */
export async function emitInboxTyping(params: {
  toUserId: string;
  fromUserId: string;
  conversationId: string;
}) {
  try {
    const entry = getSenderChannel(params.toUserId);
    await entry.ready;
    await entry.channel.send({
      type: "broadcast",
      event: "typing",
      payload: {
      },
    });
  } catch {
    /* noop */
  }
}
