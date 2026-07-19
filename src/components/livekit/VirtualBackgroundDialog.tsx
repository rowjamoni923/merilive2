/**
 * Pkg125: Virtual Background UI toggle (web hosts).
 *
 * Three modes: None / Blur / Image. Persists last choice per-user in
 * localStorage so it auto-reapplies when the host re-publishes the camera.
 * Pkg119 kill-switch (`virtual_background`) is enforced inside
 * applyVirtualBackground — UI still renders so admin can flip it on
 * server-side without a deploy.
 *
 * No new Supabase channels, no polls, no cross-user reads.
 */
import { useEffect, useState } from "react";
import { Sparkles, X, ImageIcon, CircleSlash } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  applyVirtualBackground,
  applyVirtualBackgroundNative,
  isVirtualBackgroundSupported,
  type VirtualBackgroundMode,
} from "@/lib/livekitVirtualBackground";

const LS_KEY = "merilive_vbg_v1";

interface PersistedChoice {
  mode: VirtualBackgroundMode;
  blurRadius: number;
  imageUrl: string;
}

function loadPersisted(): PersistedChoice {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { mode: "none", blurRadius: 15, imageUrl: "" };
    const parsed = JSON.parse(raw);
    return {
      mode: (["none", "blur", "image"] as const).includes(parsed.mode)
        ? parsed.mode
        : "none",
      blurRadius:
        typeof parsed.blurRadius === "number" ? parsed.blurRadius : 15,
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : "",
    };
  } catch {
    return { mode: "none", blurRadius: 15, imageUrl: "" };
  }
}

function savePersisted(c: PersistedChoice) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(c));
  } catch {
    /* ignore quota */
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Live LocalVideoTrack from LiveKit (`useLiveKitClient.localVideoTrack`). Not needed on native. */
  localVideoTrack?: any;
  /** When true, routes through nativeLiveKitController instead of web track-processors. */
  isNative?: boolean;
}

export function VirtualBackgroundDialog({ open, onClose, localVideoTrack, isNative = false }: Props) {
  const persisted = loadPersisted();
  const [mode, setMode] = useState<VirtualBackgroundMode>(persisted.mode);
  const [blurRadius, setBlurRadius] = useState<number>(persisted.blurRadius);
  const [imageUrl, setImageUrl] = useState<string>(persisted.imageUrl);
  const [applying, setApplying] = useState(false);
  const supported = isVirtualBackgroundSupported();

  // Reload persisted values whenever dialog opens (in case user changed
  // mid-session in another tab).
  useEffect(() => {
    if (!open) return;
    const p = loadPersisted();
    setMode(p.mode);
    setBlurRadius(p.blurRadius);
    setImageUrl(p.imageUrl);
  }, [open]);

  const apply = async (next: Partial<PersistedChoice>) => {
    const choice: PersistedChoice = {
      mode: next.mode ?? mode,
      blurRadius: next.blurRadius ?? blurRadius,
      imageUrl: next.imageUrl ?? imageUrl,
    };
    if (choice.mode === "image" && !choice.imageUrl) {
      toast.error("Please paste an image URL first");
      return;
    }
    if (isNative && choice.mode === "image") {
      toast.info("Image background not supported on Android yet — use Blur");
      return;
    }
    if (!isNative && !localVideoTrack) {
      toast.error("Camera not active yet");
      return;
    }
    setApplying(true);
    try {
      const ok = isNative
        ? await applyVirtualBackgroundNative({
            mode: choice.mode,
            blurRadius: choice.blurRadius,
          })
        : await applyVirtualBackground(localVideoTrack, {
            mode: choice.mode,
            blurRadius: choice.blurRadius,
            imageUrl: choice.imageUrl,
          });
      savePersisted(choice);
      if (choice.mode === "none") {
        toast.success("Background cleared");
      } else if (!ok) {
        toast.error("Background unavailable on this device");
      } else {
        toast.success(
          choice.mode === "blur" ? "Background blur applied" : "Background image applied"
        );
      }
    } catch (err) {
      console.warn("[Pkg125] apply failed", err);
      toast.error("Couldn't apply background");
    } finally {
      setApplying(false);
    }
  };

  const ModeButton = ({
    value,
    icon: Icon,
    label,
  }: {
    value: VirtualBackgroundMode;
    icon: typeof Sparkles;
    label: string;
  }) => {
    const active = mode === value;
    return (
      <button
        type="button"
        onClick={() => {
          setMode(value);
          if (value !== "image") void apply({ mode: value });
        }}
        className={`flex-1 flex flex-col items-center gap-1.5 rounded-xl px-3 py-3 border transition-all ${
          active
            ? "bg-primary/15 border-primary text-primary"
            : "bg-muted/30 border-border/40 text-muted-foreground hover:bg-muted/50"
        }`}
        disabled={applying || !supported}
      >
        <Icon className="w-5 h-5" />
        <span className="text-xs font-medium">{label}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Virtual Background
          </DialogTitle>
        </DialogHeader>

        {!supported && (
          <p className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
            Your device doesn't support background effects. Try on a desktop browser.
          </p>
        )}

        <div className="flex gap-2">
          <ModeButton value="none" icon={CircleSlash} label="None" />
          <ModeButton value="blur" icon={Sparkles} label="Blur" />
          {!isNative && <ModeButton value="image" icon={ImageIcon} label="Image" />}
        </div>

        {mode === "blur" && (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Blur strength</span>
              <span className="font-medium">{blurRadius}px</span>
            </div>
            <Slider
              value={[blurRadius]}
              min={5}
              max={40}
              step={1}
              onValueChange={(v) => setBlurRadius(v[0])}
              onValueCommit={(v) => void apply({ blurRadius: v[0] })}
              disabled={applying || !supported}
            />
          </div>
        )}

        {mode === "image" && (
          <div className="space-y-2 pt-2">
            <label className="text-xs text-muted-foreground">Image URL (CORS-enabled)</label>
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/bg.jpg"
            />
            <Button
              variant="default"
              size="sm"
              className="w-full"
              onClick={() => void apply({ mode: "image" })}
              disabled={applying || !supported || !imageUrl}
            >
              Apply image
            </Button>
          </div>
        )}

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

export default VirtualBackgroundDialog;
