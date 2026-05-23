/**
 * BeautyFilterPanel — Simple Mode
 *
 * সব জটিলতা সরানো হলো। শুধু 4টা preset: Off / Soft / Natural / Strong.
 * কোনো tab/slider/category নেই। GPUPixel pro engine আসা পর্যন্ত
 * CSS-based light beauty (blur + brightness + contrast + saturation).
 */
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BeautySettings {
  preset: "off" | "soft" | "natural" | "strong";
  // legacy fields kept for compatibility with old call sites (ignored)
  smoothness?: number;
  whitening?: number;
  redness?: number;
  sharpness?: number;
  glow?: number;
  warmth?: number;
  eyeBright?: number;
  skinTone?: number;
  faceSlim?: number;
  chinSlim?: number;
  eyeEnlarge?: number;
  noseNarrow?: number;
  lipColor?: number;
}

export const DEFAULT_BEAUTY: BeautySettings = { preset: "natural" };

const PRESETS: Array<{ id: BeautySettings["preset"]; label: string }> = [
  { id: "off", label: "Off" },
  { id: "soft", label: "Soft" },
  { id: "natural", label: "Natural" },
  { id: "strong", label: "Strong" },
];

interface BeautyFilterPanelProps {
  open?: boolean;
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  settings?: BeautySettings;
  onSettingsChange?: (s: BeautySettings) => void;
  onClose?: () => void;
  [key: string]: unknown;
}

export function BeautyFilterPanel({
  open,
  enabled = true,
  settings = DEFAULT_BEAUTY,
  onSettingsChange,
  onEnabledChange,
  onClose,
}: BeautyFilterPanelProps) {
  if (!open) return null;
  const current = settings?.preset ?? "natural";

  const pick = (id: BeautySettings["preset"]) => {
    if (id === "off") {
      onEnabledChange?.(false);
      onSettingsChange?.({ ...settings, preset: "off" });
    } else {
      onEnabledChange?.(true);
      onSettingsChange?.({ ...settings, preset: id });
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] bg-background/95 backdrop-blur-xl border-t border-border rounded-t-2xl p-5 pb-7 shadow-2xl animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Beauty</h3>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((p) => {
          const active = enabled ? current === p.id : p.id === "off";
          return (
            <button
              key={p.id}
              onClick={() => pick(p.id)}
              className={cn(
                "h-12 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground text-center mt-3">
        Pro AI beauty engine coming soon
      </p>
    </div>
  );
}

export function generateBeautyCSS(enabled: boolean, settings: BeautySettings): string {
  if (!enabled || !settings || settings.preset === "off") return "";
  switch (settings.preset) {
    case "soft":
      return "blur(0.4px) brightness(1.04) contrast(1.02) saturate(1.05)";
    case "strong":
      return "blur(1.1px) brightness(1.12) contrast(1.05) saturate(1.15)";
    case "natural":
    default:
      return "blur(0.7px) brightness(1.07) contrast(1.03) saturate(1.08)";
  }
}
