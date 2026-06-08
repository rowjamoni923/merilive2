/**
 * Phase III.d — Host picker for inviting an audience member to a specific seat.
 *
 * Shown when a host taps "Invite to seat" against a viewer. Lists currently
 * empty seats (excluding seat 0 = host) and inserts a row into
 * `seat_invitations` with the chosen seat number. The invitee receives the
 * invitation in real time via `useSeatInvitationInbox` + the response sheet.
 *
 * Additive — does not edit any seat grid or party-room layout component.
 */
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SeatInvitePickerSheetProps {
  open: boolean;
  onClose: () => void;
  roomId: string;
  inviterId: string;
  inviteeId: string;
  inviteeName: string;
  maxSeats: number;
  /** Seats currently occupied (seat_number of active participants, including host=0). */
  occupiedSeats: number[];
}

export function SeatInvitePickerSheet({
  open,
  onClose,
  roomId,
  inviterId,
  inviteeId,
  inviteeName,
  maxSeats,
  occupiedSeats,
}: SeatInvitePickerSheetProps) {
  const [busy, setBusy] = useState<number | null>(null);

  const emptySeats = useMemo(() => {
    const taken = new Set(occupiedSeats);
    const result: number[] = [];
    // Seat 0 is reserved for host; offer 1..maxSeats-1.
    for (let i = 1; i < maxSeats; i += 1) {
      if (!taken.has(i)) result.push(i);
    }
    return result;
  }, [occupiedSeats, maxSeats]);

  const handlePick = async (seatNumber: number) => {
    if (busy !== null) return;
    setBusy(seatNumber);
    try {
      const { error } = await supabase.from('seat_invitations').insert({
        room_id: roomId,
        inviter_id: inviterId,
        invitee_id: inviteeId,
        seat_number: seatNumber,
      });
      if (error) {
        toast.error(error.message || 'Could not send invitation');
        return;
      }
      toast.success(`Invited ${inviteeName} to seat ${seatNumber + 1}`);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="text-base font-semibold">
          Invite {inviteeName} to a seat
        </DialogTitle>
        {emptySeats.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            All seats are taken right now.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {emptySeats.map((seat) => (
              <Button
                key={seat}
                variant="outline"
                disabled={busy !== null}
                onClick={() => handlePick(seat)}
              >
                Seat {seat + 1}
              </Button>
            ))}
          </div>
        )}
        <div className="pt-3">
          <Button variant="ghost" className="w-full" onClick={onClose} disabled={busy !== null}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SeatInvitePickerSheet;
