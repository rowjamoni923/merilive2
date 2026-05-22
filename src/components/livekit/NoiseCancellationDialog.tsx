/**
 * Pkg123: Krisp Noise Cancellation UI toggle (web hosts).
 *
 * Simple On/Off switch for background-noise suppression on the LIVE mic.
 * Persists in localStorage so the choice survives reloads/re-publish. Honors
 * the Pkg123 server kill-switch (`livekit_signaling_enabled.noise_cancellation`,
 * default OFF) inside applyNoiseCancellation — UI still renders so admin can
 * flip it on/off without a deploy.
 *
 * Pkg103's auto-applied Krisp filter (presence kill-switch) keeps running
 * independently. Toggling OFF here strips ANY processor (including Pkg103's),
 * giving the host a true raw-mic mode.
 *
 * No new Supabase channels, no polls, no cross-user reads.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, X } from "lucide-react";
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
} from "@/lib/livekitNoiseCancellation";

const LS_KEY = "merilive_noisecancel_v1";

function loadPersisted(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === "1";
  } catch {
    return false;
  }
}

function savePersisted(enabled: boolean) {
  try {
    localStorage.setItem(LS_KEY, enabled ? "1" : "0");
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
  const [enabled, setEnabled] = useState<boolean>(loadPersisted());
  const [applying, setApplying] = useState(false);
  const supported = isNoiseCancellationSupported();

  useEffect(() => {
    if (!open) return;
    setEnabled(loadPersisted());
  }, [open]);

  const apply = async (next: boolean) => {
    if (!isNative && !localAudioTrack) {
      toast.error("Microphone not active yet");
      return;
    }
    setApplying(true);
    try {
      let ok = false;
      if (isNative) {
        ok = await applyNoiseCancellationNative({ enabled: next });
        // Native "off" always succeeds even if module missing.
        if (!next) ok = true;
      } else {
        ok = next
          ? await applyNoiseCancellation(localAudioTrack, { enabled: true })
          : !!(await clearNoiseCancellation(localAudioTrack)) || true;
      }
      savePersisted(next);
      setEnabled(next);
      if (!next) {
        toast.success("Noise cancellation turned off");
      } else if (!ok) {
        toast.error("Noise cancellation unavailable on this device");
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
          Removes background noise (typing, fans, traffic, crowd) from your microphone in real time.
        </p>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={() => void apply(false)}
            disabled={applying}
            className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 border transition-all ${
              !enabled
                ? "bg-muted/40 border-border text-foreground"
                : "bg-muted/20 border-border/40 text-muted-foreground hover:bg-muted/30"
            }`}
          >
            <ShieldOff className="w-5 h-5" />
            <span className="text-xs font-medium">Off</span>
          </button>
          <button
            type="button"
            onClick={() => void apply(true)}
            disabled={applying || !supported}
            className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 border transition-all ${
              enabled
                ? "bg-primary/15 border-primary text-primary"
                : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs font-medium">On</span>
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
