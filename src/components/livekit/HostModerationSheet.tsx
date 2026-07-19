/**
 * Pkg127 + Pkg130 UI — Host moderation bottom-sheet.
 *
 * Reusable across LiveStream + PartyRoom. Lets the host:
 *  - Promote/demote in-place (audience ⇄ speaker) via Pkg130 `livekit-update-permission`
 *  - Mute / unmute a single participant's mic via Pkg127 `livekit-moderate`
 *  - Lock their mic so they cannot self-unmute
 *  - Kick them from the SFU room (LiveKit-only — DB state unchanged)
 *  - Quick header buttons: Mute All / Unmute All for the entire room
 *
 * All actions are LiveKit-permission based — money/state stay in Supabase.
 * Zero new Supabase channels / polls / cross-user reads. Optimistic close on
 * success; sonner toast on every outcome.
 */
import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowUpCircle, ArrowDownCircle, Mic, MicOff, UserX, Loader2, Volume2, VolumeX, Crown } from "lucide-react";
import {
  muteAllSpeakers,
  unmuteAllSpeakers,
  transferPartyHost,
} from "@/features/party/hostModerationActions";
import {
  promoteToSpeaker,
  demoteToAudience,
  lockMicrophone,
} from "@/lib/livekitUpdatePermission";
import {
  hostKickParticipant,
  hostMuteParticipantAudio,
  hostUnmuteParticipantAudio,
  hostMuteAllAudio,
  hostUnmuteAllAudio,
} from "@/lib/livekitModeration";

interface Props {
  open: boolean;
  onClose: () => void;
  /** LiveKit room name. Use `live_${id}` or `party_${roomId}`. */
  roomName: string | null | undefined;
  /** Target participant identity (= profiles.id in our setup). */
  identity: string | null | undefined;
  /** Pretty name for the dialog header. */
  displayName?: string;
  /** PR-2.5: Party room UUID — enables server-side mute-all + transfer-host RPCs. */
  partyRoomId?: string | null;
}

type ActionKind =
  | "promote"
  | "demote"
  | "mute_mic"
  | "unmute_mic"
  | "lock_mic"
  | "kick"
  | "mute_all"
  | "unmute_all"
  | "transfer_host";

const ERROR_MAP: Record<string, string> = {
  update_permission_disabled: "Promote/demote is disabled by admin.",
  moderation_disabled: "Moderation is disabled by admin.",
  not_room_host: "You are not the host of this room.",
  missing_required_fields: "Missing room or participant id.",
};

export const HostModerationSheet = ({
  open,
  onClose,
  roomName,
  identity,
  displayName,
  partyRoomId,
}: Props) => {
  const [busy, setBusy] = useState<ActionKind | null>(null);

  const run = async (kind: ActionKind) => {
    if (!roomName) {
      toast.error("Missing room.");
      return;
    }
    const isRoomWide = kind === "mute_all" || kind === "unmute_all";
    if (!isRoomWide && !identity) {
      toast.error("Missing participant.");
      return;
    }
    setBusy(kind);
    try {
      const reason = `host_${kind}`;
      let res: { success: boolean; error?: string };

      switch (kind) {
        case "promote":
          res = await promoteToSpeaker(roomName, identity!, reason);
          break;
        case "demote":
          res = await demoteToAudience(roomName, identity!, reason);
          break;
        case "lock_mic":
          res = await lockMicrophone(roomName, identity!, reason);
          break;
        case "mute_mic":
          res = await hostMuteParticipantAudio({
            roomName,
            identity: identity!,
            reason,
          });
          break;
        case "unmute_mic":
          res = await hostUnmuteParticipantAudio({
            roomName,
            identity: identity!,
            reason,
          });
          break;
        case "kick":
          res = await hostKickParticipant({
            roomName,
            identity: identity!,
            reason,
          });
          break;
        case "mute_all":
          res = await hostMuteAllAudio({ roomName, reason });
          // PR-2.5: also enforce in DB so users cannot self-unmute until host releases.
          if (res.success && partyRoomId) {
            const dbRes = await muteAllSpeakers(partyRoomId);
            if (!dbRes.ok) console.warn('[HostModerationSheet] mute_all DB enforce failed:', dbRes.error);
          }
          break;
        case "unmute_all":
          res = await hostUnmuteAllAudio({ roomName, reason });
          if (res.success && partyRoomId) {
            const dbRes = await unmuteAllSpeakers(partyRoomId);
            if (!dbRes.ok) console.warn('[HostModerationSheet] unmute_all DB enforce failed:', dbRes.error);
          }
          break;
        case "transfer_host": {
          // PR-2.5: server-authoritative host transfer (Party rooms only).
          if (!partyRoomId) {
            res = { success: false, error: 'transfer_host_party_only' };
            break;
          }
          const dbRes = await transferPartyHost(partyRoomId, identity!);
          res = dbRes.ok
            ? { success: true }
            : { success: false, error: (dbRes as { error: string }).error };
          break;
        }
      }

      if (res!.success) {
        toast.success(
          kind === "promote"
            ? "Promoted to speaker"
            : kind === "demote"
              ? "Demoted to audience"
              : kind === "mute_mic"
                ? "Microphone muted"
                : kind === "unmute_mic"
                  ? "Microphone unmuted"
                  : kind === "lock_mic"
                    ? "Microphone locked"
                    : kind === "kick"
                      ? "Participant kicked"
                      : kind === "mute_all"
                        ? "Muted everyone"
                        : kind === "unmute_all"
                          ? "Unmuted everyone"
                          : "Host transferred",
        );
        if (!isRoomWide) onClose();
      } else {
        const msg = ERROR_MAP[res!.error || ""] || res!.error || "Action failed.";
        toast.error(msg);
      }
    } catch (e) {
      toast.error((e as Error)?.message || "Action failed.");
    } finally {
      setBusy(null);
    }
  };

  const Item = ({
    kind,
    icon,
    label,
    sub,
    danger,
  }: {
    kind: ActionKind;
    icon: React.ReactNode;
    label: string;
    sub: string;
    danger?: boolean;
  }) => (
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
      <span className="shrink-0">
        {busy === kind ? <Loader2 className="w-5 h-5 animate-spin" /> : icon}
      </span>
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

        {/* Room-wide quick actions */}
        <div className="flex gap-2 pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => run("mute_all")}
            className="flex-1"
          >
            {busy === "mute_all" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <VolumeX className="w-4 h-4 mr-2 text-amber-500" />
            )}
            Mute All
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => run("unmute_all")}
            className="flex-1"
          >
            {busy === "unmute_all" ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Volume2 className="w-4 h-4 mr-2 text-emerald-500" />
            )}
            Unmute All
          </Button>
        </div>

        <div className="flex flex-col gap-2 py-4">
          <Item
            kind="promote"
            icon={<ArrowUpCircle className="w-5 h-5 text-emerald-500" />}
            label="Promote to Speaker"
            sub="Allow camera, mic and screen-share"
          />
          <Item
            kind="demote"
            icon={<ArrowDownCircle className="w-5 h-5 text-blue-500" />}
            label="Demote to Audience"
            sub="Listen & chat only — no publishing"
          />
          <Item
            kind="mute_mic"
            icon={<MicOff className="w-5 h-5 text-amber-500" />}
            label="Mute Microphone"
            sub="Mute their mic — they can self-unmute"
          />
          <Item
            kind="unmute_mic"
            icon={<Mic className="w-5 h-5 text-emerald-500" />}
            label="Unmute Microphone"
            sub="Re-enable their mic"
          />
          <Item
            kind="lock_mic"
            icon={<MicOff className="w-5 h-5 text-orange-500" />}
            label="Lock Microphone"
            sub="Keep on stage but block their mic"
          />
          {partyRoomId && identity && (
            <Item
              kind="transfer_host"
              icon={<Crown className="w-5 h-5 text-yellow-500" />}
              label="Transfer Host"
              sub="Make this person the new room host"
            />
          )}
          <Item
            kind="kick"
            icon={<UserX className="w-5 h-5 text-red-500" />}
            label="Kick from Room"
            sub="Disconnect them from this room"
            danger
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default HostModerationSheet;
