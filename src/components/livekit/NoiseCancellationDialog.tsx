/**
 * Pkg123 + Pkg148: Krisp Noise Cancellation UI (web hosts).
 *
 * 3-way picker:
 *   • Off — raw mic (strips any active processor, incl. Pkg103 auto-Krisp)
 *   • Standard — Krisp NC: removes typing/fans/traffic/crowd
 *   • Voice Cancel (BVC) — Krisp Background Voice Cancellation: ALSO removes
 *     other people's voices around you (cafe / shop / market). Same Krisp
 *     model with `useBVC: true`.
 *
 * Persists choice in localStorage. Honors the Pkg123 server kill-switch
 * inside applyNoiseCancellation. Native Android keeps the 2-way On/Off
 * (Kotlin module routes through WebRTC NS — BVC not supported natively).
 *
 * Zero new Supabase channels, polls, or cross-user reads.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  applyNoiseCancellation,
  applyNoiseCancellationNative,
  clearNoiseCancellation,
  isNoiseCancellationSupported,
  type NoiseCancellationMode,
} from "@/lib/livekitNoiseCancellation";

type Choice = "off" | "standard" | "bvc";
const LS_KEY = "merilive_noisecancel_v1";

function loadPersisted(): Choice {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === "bvc") return "bvc";
    if (v === "standard" || v === "1") return "standard";
    return "off";
  } catch {
    return "off";
  }
}

function savePersisted(choice: Choice) {
  try {
    localStorage.setItem(LS_KEY, choice);
  } catch {
    /* ignore quota */
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Live LocalAudioTrack from LiveKit. Not needed on native. */
  localAudioTrack?: any;
  /** When true, routes through nativeLiveKitController instead of Krisp. */
  isNative?: boolean;
}

export function NoiseCancellationDialog({ open, onClose, localAudioTrack, isNative = false }: Props) {
  const [choice, setChoice] = useState<Choice>(loadPersisted());
  const [applying, setApplying] = useState(false);
  const supported = isNoiseCancellationSupported();

  useEffect(() => {
    if (!open) return;
    setChoice(loadPersisted());
  }, [open]);

  const apply = async (next: Choice) => {
    if (!isNative && !localAudioTrack) {
      toast.error("Microphone not active yet");
      return;
    }
    setApplying(true);
    try {
      let ok = false;
      if (isNative) {
        // Native = On/Off only (BVC unavailable on Android Kotlin module).
        const wantOn = next !== "off";
        ok = await applyNoiseCancellationNative({ enabled: wantOn });
        if (!wantOn) ok = true;
      } else if (next === "off") {
        await clearNoiseCancellation(localAudioTrack);
        ok = true;
      } else {
        const mode: NoiseCancellationMode = next === "bvc" ? "bvc" : "standard";
        ok = await applyNoiseCancellation(localAudioTrack, { enabled: true, mode });
      }
      savePersisted(next);
      setChoice(next);
      if (next === "off") {
        toast.success("Noise cancellation turned off");
      } else if (!ok) {
        toast.error("Noise cancellation unavailable on this device");
      } else if (next === "bvc") {
        toast.success("Voice cancellation on — other people's voices filtered");
      } else {
        toast.success("Noise cancellation on");
      }
    } catch (err) {
      console.warn("[Pkg123] apply failed", err);
      toast.error("Couldn't toggle noise cancellation");
    } finally {
      setApplying(false);
    }
  };

  const card = (active: boolean) =>
    active
      ? "bg-primary/15 border-primary text-primary"
      : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Noise Cancellation
          </DialogTitle>
        </DialogHeader>

        {!supported && (
          <p className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
            Your device doesn't support advanced noise suppression. Try on a desktop browser.
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Standard cleans typing/fans/traffic. Voice Cancel also removes other people's voices around you — perfect for cafes, shops, and crowded places.
        </p>

        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            type="button"
            onClick={() => void apply("off")}
            disabled={applying}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 border transition-all ${card(choice === "off")}`}
          >
            <ShieldOff className="w-5 h-5" />
            <span className="text-[11px] font-medium">Off</span>
          </button>
          <button
            type="button"
            onClick={() => void apply("standard")}
            disabled={applying || (!supported && !isNative)}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 border transition-all ${card(choice === "standard")}`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-[11px] font-medium">Standard</span>
          </button>
          <button
            type="button"
            onClick={() => void apply("bvc")}
            disabled={applying || !supported || isNative}
            title={isNative ? "Voice Cancel is not available on Android yet" : undefined}
            className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 border transition-all ${card(choice === "bvc")} ${isNative ? "opacity-50" : ""}`}
          >
            <Sparkles className="w-5 h-5" />
            <span className="text-[11px] font-medium leading-tight text-center">Voice<br/>Cancel</span>
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NoiseCancellationDialog;
