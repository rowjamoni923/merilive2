/**
 * Pkg130 UI — Host moderation bottom-sheet.
 *
 * Reusable across LiveStream + PartyRoom. Lets the host promote/demote a
 * viewer in-place (audience ⇄ speaker) via Pkg130 `livekit-update-permission`,
 * lock their mic (still on stage but cannot un-mute), or kick them via Pkg127
 * `livekit-moderate`. All actions are LiveKit-permission based — money/state
 * stay in Supabase, this only mutates the SFU participant.
 *
 * Zero new Supabase channels / polls / cross-user reads. Optimistic close on
 * success; sonner toast on every outcome.
 */
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, MicOff, UserX, Loader2 } from "lucide-react";
import { promoteToSpeaker, demoteToAudience, lockMicrophone } from "@/lib/livekitUpdatePermission";
import { hostKickParticipant } from "@/lib/livekitModeration";

interface Props {
  open: boolean;
  onClose: () => void;
  /** LiveKit room name. Use `live_${id}` or `party_${roomId}`. */
  roomName: string | null | undefined;
  /** Target participant identity (= profiles.id in our setup). */
  identity: string | null | undefined;
  /** Pretty name for the dialog header. */
  displayName?: string;
}

type ActionKind = "promote" | "demote" | "lock_mic" | "kick";

const ERROR_MAP: Record<string, string> = {
  update_permission_disabled: "Promote/demote is disabled by admin.",
  moderation_disabled: "Moderation is disabled by admin.",
  not_room_host: "You are not the host of this room.",
  missing_required_fields: "Missing room or participant id.",
};

export const HostModerationSheet = ({ open, onClose, roomName, identity, displayName }: Props) => {
  const [busy, setBusy] = useState<ActionKind | null>(null);

  const run = async (kind: ActionKind) => {
    if (!roomName || !identity) {
      toast.error("Missing room or participant.");
      return;
    }
    setBusy(kind);
    try {
      const reason = `host_${kind}`;
      const res =
        kind === "promote" ? await promoteToSpeaker(roomName, identity, reason) :
        kind === "demote"  ? await demoteToAudience(roomName, identity, reason) :
        kind === "lock_mic"? await lockMicrophone(roomName, identity, reason) :
        await hostKickParticipant({ roomName, identity, reason });

      if (res.success) {
        toast.success(
          kind === "promote"  ? "Promoted to speaker" :
          kind === "demote"   ? "Demoted to audience" :
          kind === "lock_mic" ? "Microphone locked" :
                                "Participant kicked",
        );
        onClose();
      } else {
        const msg = ERROR_MAP[res.error || ""] || res.error || "Action failed.";
        toast.error(msg);
      }
    } catch (e) {
      toast.error((e as Error)?.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const Item = ({
    kind, icon, label, sub, danger,
  }: { kind: ActionKind; icon: React.ReactNode; label: string; sub: string; danger?: boolean }) => (
    <Button
      variant="ghost"
      onClick={() => run(kind)}
      disabled={busy !== null}
      className={
        "w-full h-auto justify-start gap-3 rounded-xl px-4 py-3 " +
        (danger
          ? "bg-red-500/10 hover:bg-red-500/20 text-red-600"
          : "bg-muted/40 hover:bg-muted/60 text-foreground")
      }
    >
      <span className="shrink-0">{busy === kind ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}</span>
      <span className="flex flex-col items-start text-left">
        <span className="font-semibold leading-tight">{label}</span>
        <span className="text-xs opacity-70 leading-tight">{sub}</span>
      </span>
    </Button>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Moderate {displayName || "participant"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 py-4">
          <Item kind="promote"  icon={<ArrowUpCircle className="w-5 h-5 text-emerald-500" />} label="Promote to Speaker" sub="Allow camera, mic and screen-share" />
          <Item kind="demote"   icon={<ArrowDownCircle className="w-5 h-5 text-blue-500" />}   label="Demote to Audience" sub="Listen & chat only — no publishing" />
          <Item kind="lock_mic" icon={<MicOff className="w-5 h-5 text-amber-500" />}            label="Lock Microphone"   sub="Keep on stage but block their mic" />
          <Item kind="kick"     icon={<UserX className="w-5 h-5 text-red-500" />}               label="Kick from Room"    sub="Disconnect them from this room" danger />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default HostModerationSheet;
