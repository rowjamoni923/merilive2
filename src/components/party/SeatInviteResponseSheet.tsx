/**
 * Phase III.d — Invitee response sheet for party-room seat invitations.
 *
 * Pure presentational component: rendered when `invitation` is non-null.
 * Fetches inviter (host) profile + room name once, runs a live countdown
 * to `expires_at`, and calls the supplied accept/decline handlers from
 * `useSeatInvitationInbox`. UI strings English-only per project rule.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { PendingSeatInvitation } from '@/hooks/useSeatInvitationInbox';

interface SeatInviteResponseSheetProps {
  invitation: PendingSeatInvitation | null;
  onAccept: (invitationId: string) => Promise<{ ok: boolean; error?: string; seatNumber?: number; roomId?: string }>;
  onDecline: (invitationId: string) => Promise<{ ok: boolean; error?: string }>;
  onDismiss: () => void;
  /**
   * Optional navigation hook — when invitee is on the home/feed and accepts,
   * the parent can route them into the room. Receives `roomId`.
   */
  onAccepted?: (roomId: string, seatNumber: number) => void;
}

interface InviterInfo {
  displayName: string;
  avatarUrl?: string;
  roomName?: string;
}

const ACCEPT_ERROR_MESSAGES: Record<string, string> = {
  expired: 'Invitation expired',
  seat_taken: 'That seat is already taken',
  room_closed: 'Room is no longer active',
  not_invitee: 'Invitation is not for you',
  invalid_seat: 'Seat is invalid',
  already_handled: 'Invitation already handled',
  unauthenticated: 'Please sign in again',
};

export function SeatInviteResponseSheet({
  invitation,
  onAccept,
  onDecline,
  onDismiss,
  onAccepted,
}: SeatInviteResponseSheetProps) {
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  // Live countdown
  useEffect(() => {
    if (!invitation) {
      setRemainingMs(0);
      return;
    }
    const tick = () => {
      const ms = Math.max(0, new Date(invitation.expires_at).getTime() - Date.now());
      setRemainingMs(ms);
      if (ms === 0) onDismiss();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [invitation, onDismiss]);

  // Fetch inviter + room metadata.
  useEffect(() => {
    if (!invitation) {
      setInviter(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [profileRes, roomRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', invitation.inviter_id)
          .maybeSingle(),
        supabase
          .from('party_rooms')
          .select('name')
          .eq('id', invitation.room_id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setInviter({
        displayName: profileRes.data?.display_name ?? 'Host',
        avatarUrl: profileRes.data?.avatar_url ?? undefined,
        roomName: roomRes.data?.name ?? undefined,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [invitation]);

  const seconds = useMemo(() => Math.ceil(remainingMs / 1000), [remainingMs]);

  if (!invitation) return null;

  const handleAccept = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await onAccept(invitation.id);
      if (!res.ok) {
        toast.error(ACCEPT_ERROR_MESSAGES[res.error ?? ''] ?? 'Could not accept invitation');
        onDismiss();
        return;
      }
      toast.success(`Joined seat ${(res.seatNumber ?? invitation.seat_number) + 1}`);
      if (res.roomId && res.seatNumber !== undefined) {
        onAccepted?.(res.roomId, res.seatNumber);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDecline = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDecline(invitation.id);
    } finally {
      setBusy(false);
      onDismiss();
    }
  };

  return (
    <Dialog open={!!invitation} onOpenChange={(open) => { if (!open) onDismiss(); }}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="sr-only">Seat invitation</DialogTitle>
        <div className="flex flex-col items-center gap-4 py-2">
          <Avatar className="h-16 w-16">
            <AvatarImage src={inviter?.avatarUrl} alt="" />
            <AvatarFallback>{(inviter?.displayName ?? 'H').slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="text-center space-y-1">
            <p className="text-base font-semibold text-foreground">
              {inviter?.displayName ?? 'Host'} invites you on stage
            </p>
            <p className="text-sm text-muted-foreground">
              Seat {invitation.seat_number + 1}
              {inviter?.roomName ? ` · ${inviter.roomName}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              Expires in {seconds}s
            </p>
          </div>
          <div className="flex w-full gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={handleDecline} disabled={busy}>
              Decline
            </Button>
            <Button className="flex-1" onClick={handleAccept} disabled={busy || seconds === 0}>
              Accept
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SeatInviteResponseSheet;
