/**
 * Phase III.d — Seat Invitation Inbox
 *
 * Realtime subscriber for `seat_invitations` rows where `invitee_id = me`.
 * Exposes the most recent PENDING invitation (if any) plus accept/decline
 * helpers that route through the `accept_seat_invitation` /
 * `decline_seat_invitation` server-side RPCs.
 *
 * Mount once per logged-in user (e.g. inside PartyRoom). The sheet UI lives
 * separately in `SeatInviteResponseSheet`. The hook is intentionally tiny
 * so it stays additive and does not touch existing party-room state.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PendingSeatInvitation {
  id: string;
  room_id: string;
  inviter_id: string;
  seat_number: number;
  expires_at: string;
  created_at: string;
}

interface State {
  current: PendingSeatInvitation | null;
}

export function useSeatInvitationInbox(userId: string | null | undefined) {
  const [state, setState] = useState<State>({ current: null });
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const armExpiryTimer = useCallback((inv: PendingSeatInvitation | null) => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
    if (!inv) return;
    const ms = new Date(inv.expires_at).getTime() - Date.now();
    if (ms <= 0) {
      setState((prev) => (prev.current?.id === inv.id ? { current: null } : prev));
      return;
    }
    expiryTimerRef.current = setTimeout(() => {
      setState((prev) => (prev.current?.id === inv.id ? { current: null } : prev));
    }, Math.min(ms, 2_147_483_000));
  }, []);

  // Initial fetch of any already-pending invitation (e.g. user reloaded).
  useEffect(() => {
    if (!userId) {
      setState({ current: null });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('seat_invitations')
        .select('id, room_id, inviter_id, seat_number, expires_at, created_at')
        .eq('invitee_id', userId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) return;
      const inv = data as PendingSeatInvitation;
      setState({ current: inv });
      armExpiryTimer(inv);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, armExpiryTimer]);

  // Realtime: new invitations + status updates for this user.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`seat-invitations-inbox-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'seat_invitations',
          filter: `invitee_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as PendingSeatInvitation & { status: string };
          if (row.status !== 'pending') return;
          if (new Date(row.expires_at).getTime() <= Date.now()) return;
          const inv: PendingSeatInvitation = {
            id: row.id,
            room_id: row.room_id,
            inviter_id: row.inviter_id,
            seat_number: row.seat_number,
            expires_at: row.expires_at,
            created_at: row.created_at,
          };
          setState({ current: inv });
          armExpiryTimer(inv);
        },
      )
      .on(
        'postgres_changes',
        {
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (row.status === 'pending') return;
          setState((prev) => (prev.current?.id === row.id ? { current: null } : prev));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current);
    };
  }, [userId, armExpiryTimer]);

  const dismiss = useCallback(() => setState({ current: null }), []);

  const accept = useCallback(async (invitationId: string) => {
    const { data, error } = await supabase.rpc('accept_seat_invitation', {
      p_invitation_id: invitationId,
    });
    if (error) return { ok: false as const, error: error.message };
    const res = data as { ok: boolean; error?: string; seat_number?: number; room_id?: string };
    if (!res?.ok) return { ok: false as const, error: res?.error ?? 'unknown' };
    setState((prev) => (prev.current?.id === invitationId ? { current: null } : prev));
    return { ok: true as const, seatNumber: res.seat_number, roomId: res.room_id };
  }, []);

  const decline = useCallback(async (invitationId: string) => {
    const { data, error } = await supabase.rpc('decline_seat_invitation', {
    });
    setState((prev) => (prev.current?.id === invitationId ? { current: null } : prev));
    if (error) return { ok: false as const, error: error.message };
    const res = data as { ok: boolean; error?: string };
    return res?.ok ? { ok: true as const } : { ok: false as const, error: res?.error ?? 'unknown' };
  }, []);

  return useMemo(
    () => ({ pending: state.current, dismiss, accept, decline }),
    [state.current, dismiss, accept, decline],
  );
}
