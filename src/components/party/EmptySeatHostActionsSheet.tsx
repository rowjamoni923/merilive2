/**
 * PR-2.5 — Empty Seat Host Actions (Chamet/Bigo pattern).
 *
 * When the host taps an empty seat, this sheet offers:
 *   - Move here (host moves their own seat — auto-joins as before)
 *   - Lock seat (calls set_seat_lock RPC; new joiners blocked at DB layer)
 *   - Unlock seat (calls set_seat_lock with locked=false)
 *
 * Server-authoritative — the DB trigger `guard_seat_lock_on_take` enforces
 * the lock regardless of any client-side bypass attempt.
 */
import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { ArrowDownToLine, Lock, Unlock, Loader2 } from 'lucide-react';
import { setSeatLock } from '@/features/party/hostModerationActions';

interface Props {
  open: boolean;
  onClose: () => void;
  roomId: string;
  seatNumber: number;
  isLocked: boolean;
  /** Host's own "move to this seat" action — preserves existing auto-join behavior. */
  onMoveHere: () => void;
}

type Action = 'move' | 'lock' | 'unlock';

export const EmptySeatHostActionsSheet = ({
  open,
  onClose,
  roomId,
  seatNumber,
  isLocked,
  onMoveHere,
}: Props) => {
  const [busy, setBusy] = useState<Action | null>(null);

  const run = async (action: Action) => {
    if (action === 'move') {
      setBusy('move');
      try {
        onMoveHere();
        onClose();
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy(action);
    try {
      const locked = action === 'lock';
      const res = await setSeatLock(roomId, seatNumber, locked);
      if (res.ok) {
        toast.success(locked ? 'Seat locked' : 'Seat unlocked');
        onClose();
      } else {
        toast.error((res as { error: string }).error || 'Action failed');
      }
    } catch (e) {
      toast.error((e as Error)?.message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Seat {seatNumber}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-2 py-4">
          {!isLocked && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => run('move')}
              className="w-full h-auto justify-start gap-3 rounded-xl px-4 py-3 bg-muted/40 hover:bg-muted/60 text-foreground"
            >
              <span className="shrink-0">
                {busy === 'move'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <ArrowDownToLine className="w-5 h-5 text-cyan-500" />}
              </span>
              <span className="flex flex-col items-start text-left">
                <span className="font-semibold leading-tight">Move here</span>
                <span className="text-xs opacity-70 leading-tight">Take this seat yourself</span>
              </span>
            </Button>
          )}

          {!isLocked && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => run('lock')}
              className="w-full h-auto justify-start gap-3 rounded-xl px-4 py-3 bg-muted/40 hover:bg-muted/60 text-foreground"
            >
              <span className="shrink-0">
                {busy === 'lock'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <Lock className="w-5 h-5 text-orange-500" />}
              </span>
              <span className="flex flex-col items-start text-left">
                <span className="font-semibold leading-tight">Lock seat</span>
                <span className="text-xs opacity-70 leading-tight">Block anyone from taking it</span>
              </span>
            </Button>
          )}

          {isLocked && (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() => run('unlock')}
              className="w-full h-auto justify-start gap-3 rounded-xl px-4 py-3 bg-muted/40 hover:bg-muted/60 text-foreground"
            >
              <span className="shrink-0">
                {busy === 'unlock'
                  ? <Loader2 className="w-5 h-5 animate-spin" />
                  : <Unlock className="w-5 h-5 text-emerald-500" />}
              </span>
              <span className="flex flex-col items-start text-left">
                <span className="font-semibold leading-tight">Unlock seat</span>
                <span className="text-xs opacity-70 leading-tight">Allow audience to join this seat</span>
              </span>
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default EmptySeatHostActionsSheet;
