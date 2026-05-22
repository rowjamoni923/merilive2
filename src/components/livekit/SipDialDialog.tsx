/**
 * Pkg110: SIP Outbound dial-pad host UI.
 *
 * Hosts can dial a phone number (E.164) into their live_streams room as an
 * audio-only participant. The active call list shows recent dials with hang-up
 * action. Server-side: livekit-sip edge fn + `sip` kill-switch (Pkg110).
 *
 * Zero new Supabase Realtime channels, zero polls, zero cross-user reads.
 */
import { useCallback, useState } from "react";
import { Phone, PhoneOff, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sipDial, sipHangup } from "@/lib/livekitSip";

interface ActiveDial {
  sipParticipantId: string;
  phoneNumber: string;
  participantName?: string;
  startedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  streamId: string | null | undefined;
}

const E164_RE = /^\+[1-9]\d{6,14}$/;

export function SipDialDialog({ open, onClose, streamId }: Props) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [dialing, setDialing] = useState(false);
  const [active, setActive] = useState<ActiveDial[]>([]);

  const roomName = streamId ? `live_${streamId}` : "";

  const handleDial = useCallback(async () => {
    if (!streamId) return;
    const num = phone.trim();
    if (!E164_RE.test(num)) {
      toast.error("Enter a valid phone in E.164 format (e.g. +12025550101)");
      return;
    }
    setDialing(true);
    try {
      const res = await sipDial(streamId, num, name.trim() || undefined);
      if (!res) {
        toast.error("Couldn't place call. Admin may have disabled SIP dialing.");
        return;
      }
      setActive((prev) => [
        {
          sipParticipantId: res.sipParticipantId,
          phoneNumber: num,
          participantName: name.trim() || undefined,
          startedAt: Date.now(),
        },
        ...prev,
      ]);
      setPhone("");
      setName("");
      toast.success(`Dialing ${num}…`);
    } finally {
      setDialing(false);
    }
  }, [streamId, phone, name]);

  const handleHangup = useCallback(
    async (sipParticipantId: string) => {
      if (!roomName) return;
      const ok = await sipHangup(sipParticipantId, roomName);
      if (ok) {
        setActive((prev) => prev.filter((a) => a.sipParticipantId !== sipParticipantId));
        toast.success("Call ended");
      } else {
        toast.error("Couldn't end call");
      }
    },
    [roomName],
  );

  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
  const appendDigit = (d: string) => setPhone((p) => (p ? p + d : d === "+" ? "+" : `+${d}`));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-emerald-500" />
            Dial Phone Number
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Add a phone caller (audio-only) into your live room. Enter the number
            in international E.164 format.
          </p>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Phone number
            </label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+12025550101"
              inputMode="tel"
              className="font-mono text-base tracking-wider"
              disabled={dialing}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-muted-foreground">
              Display name (optional)
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Guest caller"
              maxLength={40}
              disabled={dialing}
            />
          </div>

          {/* Dial pad */}
          <div className="grid grid-cols-3 gap-2">
            {pad.map((d) => (
              <Button
                key={d}
                variant="outline"
                size="lg"
                onClick={() => setPhone((p) => p + d)}
                disabled={dialing}
                className="font-mono text-lg"
              >
                {d}
              </Button>
            ))}
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPhone("")}
              disabled={dialing || !phone}
              className="flex-1"
            >
              Clear
            </Button>
            <Button
              onClick={handleDial}
              disabled={dialing || !streamId}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {dialing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Phone className="h-4 w-4 mr-2" />
              )}
              Dial
            </Button>
          </div>

          {active.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-medium text-muted-foreground">
                Active calls
              </p>
              {active.map((a) => (
                <div
                  key={a.sipParticipantId}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/40"
                >
                  <Phone className="h-4 w-4 text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs truncate">{a.phoneNumber}</div>
                    {a.participantName && (
                      <div className="text-[11px] text-muted-foreground truncate">
                        {a.participantName}
                      </div>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="destructive"
                    onClick={() => handleHangup(a.sipParticipantId)}
                    aria-label="Hang up"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SipDialDialog;
