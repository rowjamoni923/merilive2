/**
 * Beauty Filter Controls for Live Streaming (Web)
 * 
 * Uses CSS filters + Canvas for real-time beauty effects:
 * - Skin Smoothing (blur)
 * - Skin Whitening (brightness + contrast)
 * - Sharpness
 * - Warm/Cool tone
 * 
 * 100% FREE — no external SDK required.
 */
import { useState, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Sparkles, RotateCcw } from "lucide-react";

export interface BeautyParams {
  smoothing: number;   // 0-100
  whitening: number;   // 0-100
  sharpness: number;   // 0-100
  warmth: number;      // 0-100 (50 = neutral)
}

const DEFAULT_PARAMS: BeautyParams = {
  smoothing: 30,
  whitening: 20,
  sharpness: 15,
  warmth: 50,
};

interface BeautyFilterControlsProps {
  params: BeautyParams;
  onChange: (params: BeautyParams) => void;
  onReset?: () => void;
}

/**
 * Convert BeautyParams to CSS filter string for <video> or <canvas> overlay
 */
export function beautyParamsToCSS(params: BeautyParams): string {
  const filters: string[] = [];

  // Smoothing: slight blur for skin smoothing effect
  if (params.smoothing > 0) {
    const blurPx = (params.smoothing / 100) * 1.5; // max 1.5px blur
    filters.push(`blur(${blurPx.toFixed(2)}px)`);
  }

  // Whitening: brightness + contrast boost
  if (params.whitening > 0) {
    const brightness = 1 + (params.whitening / 100) * 0.25; // max 1.25
    const contrast = 1 + (params.whitening / 100) * 0.1;    // max 1.1
    filters.push(`brightness(${brightness.toFixed(3)})`);
    filters.push(`contrast(${contrast.toFixed(3)})`);
  }

  // Sharpness: simulated via contrast
  if (params.sharpness > 0) {
    const extraContrast = 1 + (params.sharpness / 100) * 0.15;
    filters.push(`contrast(${extraContrast.toFixed(3)})`);
  }

  // Warmth: hue-rotate + saturate
  if (params.warmth !== 50) {
    const hueShift = ((params.warmth - 50) / 50) * 10; // -10 to +10 degrees
    const saturation = 1 + ((params.warmth - 50) / 50) * 0.2;
    filters.push(`hue-rotate(${hueShift.toFixed(1)}deg)`);
    filters.push(`saturate(${saturation.toFixed(3)})`);
  }

  return filters.join(' ') || 'none';
}

export const BeautyFilterControls: React.FC<BeautyFilterControlsProps> = ({
  params,
  onChange,
  onReset,
}) => {
  const updateParam = useCallback(
    (key: keyof BeautyParams, value: number) => {
      onChange({ ...params, [key]: value });
    },
    [params, onChange]
  );

  const handleReset = () => {
    onChange({ ...DEFAULT_PARAMS });
    onReset?.();
  };

  const sliders = [
    { key: 'smoothing' as const, label: '✨ Smoothing', icon: '🧴' },
    { key: 'whitening' as const, label: '🌟 Whitening', icon: '💡' },
    { key: 'sharpness' as const, label: '🔍 Sharpness', icon: '✏️' },
    { key: 'warmth' as const, label: '🌡️ Warmth', icon: '☀️' },
  ];

  return (
    <div className="w-full space-y-3 p-3 bg-background/90 backdrop-blur-md rounded-xl border border-border/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Beauty</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReset}
          className="h-7 text-xs text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="w-3 h-3 mr-1" />
          Reset
        </Button>
      </div>

      {sliders.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">
              {params[key]}
            </span>
          </div>
          <Slider
            value={[params[key]]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => updateParam(key, v)}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
};

export { DEFAULT_PARAMS };
export default BeautyFilterControls;
