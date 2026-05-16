import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RotateCcw, Sparkles } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * 4x5 Color Matrix Editor — Flutter parity for Elite Beauty Studio
 * Matrix is a flat 20-element array [r1,r2,r3,r4,r5, g1,g2,..., b..., a...]
 * Slugs match Flutter BeautyEffectService: none / natural / bright / rosy / fresh
 */

export const IDENTITY_MATRIX: number[] = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

export const PRESETS: Record<string, { name: string; matrix: number[] }> = {
  identity: { name: "None / Identity", matrix: IDENTITY_MATRIX },
  natural: {
    name: "Natural",
    matrix: [
      1.0, 0, 0, 0, 10,
      0, 1.0, 0, 0, 5,
      0, 0, 1.0, 0, 0,
      0, 0, 0, 1, 0,
    ],
  },
  bright: {
    name: "Bright",
    matrix: [
      1.1, 0, 0, 0, 20,
      0, 1.1, 0, 0, 20,
      0, 0, 1.1, 0, 20,
      0, 0, 0, 1, 0,
    ],
  },
  rosy: {
    name: "Rosy",
    matrix: [
      1.1, 0, 0, 0, 30,
      0, 1.0, 0, 0, 10,
      0, 0, 1.0, 0, 15,
      0, 0, 0, 1, 0,
    ],
  },
  fresh: {
    name: "Fresh",
    matrix: [
      1.0, 0, 0, 0, 5,
      0, 1.1, 0, 0, 15,
      0, 0, 1.2, 0, 25,
      0, 0, 0, 1, 0,
    ],
  },
};

const ROW_LABELS = ["R", "G", "B", "A"];
const COL_LABELS = ["R", "G", "B", "A", "Off"];
const ROW_COLORS = [
  "from-rose-500/20 to-rose-500/5 border-rose-500/30",
  "from-emerald-500/20 to-emerald-500/5 border-emerald-500/30",
  "from-sky-500/20 to-sky-500/5 border-sky-500/30",
  "from-slate-500/20 to-slate-500/5 border-slate-500/30",
];

interface Props {
  value: number[];
  onChange: (matrix: number[]) => void;
  previewUrl?: string | null;
}

export const ColorMatrixEditor = ({ value, onChange, previewUrl }: Props) => {
  const [matrix, setMatrix] = useState<number[]>(value && value.length === 20 ? value : IDENTITY_MATRIX);

  useEffect(() => {
    if (value && value.length === 20) setMatrix(value);
  }, [value]);

  const updateCell = (idx: number, raw: string) => {
    const num = parseFloat(raw);
    const next = [...matrix];
    next[idx] = isNaN(num) ? 0 : num;
    setMatrix(next);
    onChange(next);
  };

  const applyPreset = (key: string) => {
    const next = [...PRESETS[key].matrix];
    setMatrix(next);
    onChange(next);
  };

  // CSS preview using SVG feColorMatrix
  const cssMatrix = matrix.join(" ");

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-fuchsia-400" />
              Color Matrix (4×5)
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Maps to Flutter <code className="text-fuchsia-400">ColorFilter.matrix()</code> — used by mobile Elite Beauty Studio.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => applyPreset("identity")}
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Reset
          </Button>
        </div>

        {/* Preset chips */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(key)}
              className="text-xs"
            >
              {preset.name}
            </Button>
          ))}
        </div>

        {/* Live preview */}
        {previewUrl && (
          <Card className="bg-muted/20 border-muted/40">
            <CardContent className="p-3">
              <Label className="text-xs text-muted-foreground mb-2 block">Live preview</Label>
              <div className="flex items-center justify-center gap-4">
                <svg width="0" height="0" className="absolute">
                  <defs>
                    <filter id="liveBeautyMatrix">
                      <feColorMatrix type="matrix" values={cssMatrix} />
                    </filter>
                  </defs>
                </svg>
                <div className="text-center">
                  <img
                    src={previewUrl}
                    alt="original"
                    className="w-24 h-24 rounded-lg object-cover" />
                  <p className="text-[10px] text-muted-foreground mt-1">Original</p>
                </div>
                <div className="text-center">
                  <img
                    src={previewUrl}
                    alt="filtered"
                    className="w-24 h-24 rounded-lg object-cover"
                    style={{ filter: "url(#liveBeautyMatrix)" }} />
                  <p className="text-[10px] text-fuchsia-400 mt-1">With filter</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Matrix grid */}
        <div className="space-y-2">
          <div className="grid grid-cols-[24px_repeat(5,1fr)] gap-1.5 items-center">
            <div />
            {COL_LABELS.map((c) => (
              <div key={c} className="text-[10px] text-center font-mono text-muted-foreground">
                {c}
              </div>
            ))}
          </div>

          {ROW_LABELS.map((rowLabel, rowIdx) => (
            <div key={rowLabel} className="grid grid-cols-[24px_repeat(5,1fr)] gap-1.5 items-center">
              <div className={`text-xs font-bold text-center rounded bg-gradient-to-br border ${ROW_COLORS[rowIdx]} py-1`}>
                {rowLabel}
              </div>
              {Array.from({ length: 5 }).map((_, colIdx) => {
                const idx = rowIdx * 5 + colIdx;
                return (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <Input
                        type="number"
                        step="0.1"
                        value={matrix[idx]}
                        onChange={(e) => updateCell(idx, e.target.value)}
                        className="h-8 text-xs text-center font-mono px-1"
                      />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p className="text-xs">
                        {rowLabel} channel {colIdx === 4 ? "offset" : `× ${COL_LABELS[colIdx]}`}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          ))}
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">JSON output (Flutter-compatible)</summary>
          <pre className="mt-2 p-2 bg-muted/30 rounded text-[10px] overflow-x-auto">
            {JSON.stringify(matrix)}
          </pre>
        </details>
      </div>
    </TooltipProvider>
  );
};
