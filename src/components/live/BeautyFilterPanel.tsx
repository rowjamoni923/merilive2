/** Camera rebuild 2026-06-14: UI-only beauty panel; native beauty engine removed. */
import { Sparkles, X, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export interface ProBeautyLevels { smooth: number; white: number; thinFace: number; bigEye: number; lipstick: number; blusher: number }
export const DEFAULT_PRO_BEAUTY: ProBeautyLevels = { smooth: 6, white: 4, thinFace: 3, bigEye: 3, lipstick: 0, blusher: 0 };
const STORAGE_KEY = 'pkg200.beauty.levels.v1';
function loadStoredLevels(): ProBeautyLevels { try { return { ...DEFAULT_PRO_BEAUTY, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; } catch { return { ...DEFAULT_PRO_BEAUTY }; } }
function persistLevels(levels: ProBeautyLevels) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(levels)); } catch { /* noop */ } }

export interface BeautySettings {
  preset: "off" | "soft" | "natural" | "strong" | "custom";
  // Pro levels — used when preset === "custom" or on native
  levels?: ProBeautyLevels;
  // legacy fields kept for compatibility
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

export const DEFAULT_BEAUTY: BeautySettings = {
  preset: "natural",
  levels: { ...DEFAULT_PRO_BEAUTY },
};

const PRESETS: Array<{ id: Exclude<BeautySettings["preset"], "custom">; label: string; levels: ProBeautyLevels }> = [
  { id: "off",     label: "Off",     levels: { smooth: 0, white: 0, thinFace: 0, bigEye: 0, lipstick: 0, blusher: 0 } },
  { id: "soft",    label: "Soft",    levels: { smooth: 3, white: 2, thinFace: 2, bigEye: 2, lipstick: 0, blusher: 0 } },
  { id: "natural", label: "Natural", levels: { smooth: 6, white: 4, thinFace: 3, bigEye: 3, lipstick: 0, blusher: 0 } },
  { id: "strong",  label: "Strong",  levels: { smooth: 9, white: 7, thinFace: 6, bigEye: 5, lipstick: 2, blusher: 2 } },
];

const SLIDERS: Array<{ key: keyof ProBeautyLevels; label: string }> = [
  { key: "smooth",   label: "Skin Smooth" },
  { key: "white",    label: "Whiten" },
  { key: "thinFace", label: "Thin Face" },
  { key: "bigEye",   label: "Big Eye" },
  { key: "lipstick", label: "Lipstick" },
  { key: "blusher",  label: "Blusher" },
];

interface BeautyFilterPanelProps {
  open?: boolean;
  isOpen?: boolean; // alias used by GoLive/LiveStream/PartyRoom/ActiveCallScreen
  enabled?: boolean;
  onEnabledChange?: (v: boolean) => void;
  settings?: BeautySettings;
  onSettingsChange?: (s: BeautySettings) => void;
  onClose?: () => void;
  [key: string]: unknown;
}

export function BeautyFilterPanel({
  open,
  isOpen,
  enabled = true,
  settings = DEFAULT_BEAUTY,
  onSettingsChange,
  onEnabledChange,
  onClose,
}: BeautyFilterPanelProps) {
  const panelOpen = open ?? isOpen ?? false;
  const initialLevels: ProBeautyLevels = useMemo(
    () => settings?.levels ?? loadStoredLevels(),
    // initialise once when panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelOpen],
  );

  const [levels, setLevels] = useState<ProBeautyLevels>(initialLevels);
  const native = false;

  if (!panelOpen) return null;


  const currentPreset: BeautySettings["preset"] = settings?.preset ?? "natural";

  const pickPreset = (p: typeof PRESETS[number]) => {
    if (p.id === "off") {
      onEnabledChange?.(false);
    } else {
      onEnabledChange?.(true);
    }
    setLevels(p.levels);
    onSettingsChange?.({ ...settings, preset: p.id, levels: p.levels });
  };

  const onSlider = (key: keyof ProBeautyLevels, value: number) => {
    const next = { ...levels, [key]: value };
    setLevels(next);
    onSettingsChange?.({ ...settings, preset: "custom", levels: next });
    if (!enabled) onEnabledChange?.(true);
  };

  const resetAll = () => {
    setLevels({ ...DEFAULT_PRO_BEAUTY });
    onSettingsChange?.({ ...settings, preset: "natural", levels: { ...DEFAULT_PRO_BEAUTY } });
    onEnabledChange?.(true);
  };

  return (
    <div className={cn(
      "fixed inset-x-0 bottom-0 z-[80] max-h-[80dvh] overflow-y-auto bg-background/95 backdrop-blur-xl border-t border-border rounded-t-2xl p-5 pb-7 shadow-2xl animate-in slide-in-from-bottom duration-200",
      "md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-[600px] md:rounded-3xl md:bottom-10 md:border md:shadow-2xl md:max-h-[60dvh]"
    )}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Beauty</h3>
          {native && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-medium">
              PRO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
            aria-label="Reset"
          >
            <RotateCcw className="w-4 h-4 text-foreground" />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>
      </div>

      {/* Presets */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        {PRESETS.map((p) => {
          const active = enabled ? currentPreset === p.id : p.id === "off";
          return (
            <button
              key={p.id}
              onClick={() => pickPreset(p)}
              className={cn(
                "h-11 rounded-xl text-sm font-medium transition-all",
                active
                  ? "bg-primary text-primary-foreground shadow-lg scale-[1.02]"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Fine sliders */}
      <div className="space-y-3.5">
        {SLIDERS.map(({ key, label }) => {
          const value = levels[key];
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-foreground tabular-nums">{value}</span>
              </div>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={value}
                disabled={!enabled}
                onChange={(e) => onSlider(key, Number(e.target.value))}
                className="w-full accent-primary disabled:opacity-40"
              />
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-4">
        Camera stability mode is active. Beauty settings are saved but not applied to the native camera.
      </p>
    </div>
  );
}

/** Compatibility helper — camera stability mode never applies visual filters. */
export function generateBeautyCSS(enabled: boolean, settings: BeautySettings): string {
  if (!enabled || !settings) return "";
  // Native beauty was removed in Phase 9K; do not add CSS blur fallback.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cap: any = (globalThis as any).Capacitor;
    if (cap && typeof cap.getPlatform === 'function' && cap.getPlatform() === 'android') {
      return "";
    }
  } catch { /* not in Capacitor env, fall through to CSS preview */ }
  // If custom levels exist, derive CSS from smooth + white.
  if (settings.levels) {
    const { smooth, white } = settings.levels;
    if (smooth <= 0 && white <= 0) return "";
    const blur = (smooth / 10) * 1.2;
    const bright = 1 + (white / 10) * 0.12;
    const sat = 1 + (smooth / 10) * 0.12;
    return `blur(${blur.toFixed(2)}px) brightness(${bright.toFixed(2)}) contrast(1.03) saturate(${sat.toFixed(2)})`;
  }
  if (settings.preset === "off") return "";
  switch (settings.preset) {
    case "soft":   return "blur(0.4px) brightness(1.04) contrast(1.02) saturate(1.05)";
    case "strong": return "blur(1.1px) brightness(1.12) contrast(1.05) saturate(1.15)";
    case "natural":
    default:       return "blur(0.7px) brightness(1.07) contrast(1.03) saturate(1.08)";
  }
}
