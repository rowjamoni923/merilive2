import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Host-side listener for Chamet-style random-call broadcasts.
 *
 * Flow:
 *  1. Caller hits `random-call-enqueue` with mode=broadcast.
 *  2. Server fans out `random_incoming_call` to every online verified host's
 *     personal `user-${hostId}` Supabase Realtime channel.
 *  3. This hook subscribes to that channel and surfaces an incoming-call ring.
 *  4. On accept → `random-call-host-respond` (atomic claim, first wins).
 *  5. On winner → navigate to /match-call with session/room so the host joins.
 *     Server also pings `user-${callerId}` with `random_broadcast_matched`
 *     so the caller's MatchCall page can complete the handoff.
 *
 * Losers are dismissed silently via `broadcast-${broadcastId}` channel
 * (`random_broadcast_taken` event).
 */
export interface RandomIncomingCall {
  broadcastId: string;
  callerId: string;
  room: string;
  ringTimeoutSeconds: number;
  callerName?: string;
  callerAvatar?: string | null;
  receivedAt: number;
}

export function useRandomCallIncoming() {
  const [incoming, setIncoming] = useState<RandomIncomingCall | null>(null);
  const [accepting, setAccepting] = useState(false);
  const navigate = useNavigate();
  const userIdRef = useRef<string | null>(null);
  const isHostRef = useRef(false);

  // Subscribe to user-${uid} for random_incoming_call (only if host)
  useEffect(() => {
    let channel: any = null;
    let cancelled = false;

    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid || cancelled) return;
      userIdRef.current = uid;

      const { data: prof } = await supabase
        .from("profiles")
        .select("is_host, host_status")
        .eq("id", uid)
        .maybeSingle();

      const isHost = !!(prof?.is_host) || prof?.host_status === "approved";
      isHostRef.current = isHost;
      if (!isHost || cancelled) return;

      channel = supabase
        .channel(`user-${uid}`, { config: { broadcast: { self: false } } })
        .on("broadcast", { event: "random_incoming_call" }, async (msg: any) => {
          const p = msg?.payload ?? {};
          if (!p.broadcast_id || !p.caller_id || !p.room) return;

          // Skip if already showing one or already in a call
          if (window.location.pathname.startsWith("/match-call")) {
            // host is the caller side — never ring themselves
            return;
          }

          // Lightweight caller profile fetch (non-blocking display)
          let callerName: string | undefined;
          let callerAvatar: string | null | undefined;
          try {
            const { data: caller } = await supabase
              .from("profiles")
              .select("display_name, username, avatar_url")
              .eq("id", p.caller_id)
              .maybeSingle();
            callerName = (caller as any)?.display_name || (caller as any)?.username;
            callerAvatar = (caller as any)?.avatar_url ?? null;
          } catch (_) { /* */ }

          setIncoming({
            broadcastId: p.broadcast_id,
            callerId: p.caller_id,
            room: p.room,
            ringTimeoutSeconds: Number(p.ring_timeout_seconds ?? 20),
            callerName,
            callerAvatar,
            receivedAt: Date.now(),
          });
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) {
        try { supabase.removeChannel(channel); } catch (_) {}
      }
    };
  }, []);

  // While ringing: listen for "already taken" + enforce ring timeout
  useEffect(() => {
    if (!incoming) return;
    const bid = incoming.broadcastId;

    const takenCh = supabase
      .channel(`broadcast-${bid}`)
      .on("broadcast", { event: "random_broadcast_taken" }, (msg: any) => {
        const p = msg?.payload ?? {};
        if (p.broadcast_id === bid && p.winner_id !== userIdRef.current) {
          setIncoming(null);
        }
      })
      .subscribe();

    const elapsedAtMount = Date.now() - incoming.receivedAt;
    const remaining = Math.max(0, incoming.ringTimeoutSeconds * 1000 - elapsedAtMount);
    const t = window.setTimeout(() => setIncoming(null), remaining + 500);

    return () => {
      try { supabase.removeChannel(takenCh); } catch (_) {}
      window.clearTimeout(t);
    };
  }, [incoming?.broadcastId, incoming?.receivedAt, incoming?.ringTimeoutSeconds]);

  const accept = useCallback(async () => {
    if (!incoming || accepting) return;
    setAccepting(true);
    const current = incoming;
    try {
      const { data, error } = await supabase.functions.invoke(
        "random-call-host-respond",
        { body: { broadcast_id: current.broadcastId, action: "accept" } },
      );
      if (error) throw error;
      const r = data as any;
      setIncoming(null);
      if (r?.ok) {
        try {
          window.localStorage.setItem(
            `random_call:auto_accept:${current.callerId}`,
            JSON.stringify({ broadcastId: current.broadcastId, expiresAt: Date.now() + 45000 }),
          );
        } catch (_) { /* ignore */ }
        // Server has now broadcast `random_broadcast_matched` to the caller.
        // The caller's MatchCall page completes the handoff which calls
        // `startCall(hostId)` → standard private-call pipeline (call-deliver
        // FCM + private_calls postgres_changes) rings this host through the
        // existing IncomingCallModal → host taps Accept → joins the LiveKit
        // room. We deliberately do NOT navigate here; the global
        // CallProvider already handles the rest. A subtle toast confirms the
        // claim so the host knows their accept registered.
        toast.success("Matched — connecting…");
      } else if (r?.reason === "already_taken") {
        // silent — another host won
      } else {
        toast.error("Could not accept the call.");
      }
    } catch (e: any) {
      toast.error("Could not accept the call.");
    } finally {
      setAccepting(false);
    }
  }, [incoming, accepting, navigate]);

  const reject = useCallback(async () => {
    if (!incoming) return;
    const bid = incoming.broadcastId;
    setIncoming(null);
    // Broadcast-mode reject is silent server-side (no streak penalty),
    // but we still fire-and-forget for analytics consistency.
    try {
      await supabase.functions.invoke("random-call-host-respond", {
        body: { broadcast_id: bid, action: "reject" },
      });
    } catch (_) { /* */ }
  }, [incoming]);

  return { incoming, accept, reject, accepting };
}
