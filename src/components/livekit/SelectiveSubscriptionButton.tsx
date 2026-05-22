/**
 * Pkg150 — Selective subscription picker (Phase 2 #7)
 *
 * Party-room-only floating button. Off / 4 / 8 / 12 / 16 video caps.
 * When enabled, viewer's SFU video budget is capped to top-N priority
 * participants (host + recent active speakers); the rest stay audio-only.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SELECTIVE_SUB_CHANGED_EVENT,
  getSelectiveSubConfig,
  setSelectiveSubConfig,
  type SelectiveSubConfig,
} from "@/lib/livekitSelectiveSubscription";

export interface SelectiveSubscriptionButtonProps {
  className?: string;
  label?: string;
}

const CHOICES: { id: string; label: string; value: Partial<SelectiveSubConfig> }[] = [
  { id: "off", label: "Off (all videos)", value: { enabled: false, maxVideo: 6 } },
  { id: "4", label: "Top 4 videos", value: { enabled: true, maxVideo: 4 } },
  { id: "8", label: "Top 8 videos", value: { enabled: true, maxVideo: 8 } },
  { id: "12", label: "Top 12 videos", value: { enabled: true, maxVideo: 12 } },
  { id: "16", label: "Top 16 videos", value: { enabled: true, maxVideo: 16 } },
];

function currentChoiceId(c: SelectiveSubConfig): string {
  if (!c.enabled) return "off";
  return CHOICES.find((x) => x.value.maxVideo === c.maxVideo)?.id ?? "8";
}

function shortLabel(c: SelectiveSubConfig): string {
  if (!c.enabled) return "All";
  return `Top ${c.maxVideo}`;
}

export const SelectiveSubscriptionButton = memo(function SelectiveSubscriptionButton({
  className,
  label = "Video budget",
}: SelectiveSubscriptionButtonProps) {
  const [cfg, setCfg] = useState<SelectiveSubConfig>(() => getSelectiveSubConfig());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<SelectiveSubConfig>).detail;
      if (detail) setCfg(detail);
      else setCfg(getSelectiveSubConfig());
    };
    window.addEventListener(SELECTIVE_SUB_CHANGED_EVENT, onChange as EventListener);
    return () => window.removeEventListener(SELECTIVE_SUB_CHANGED_EVENT, onChange as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback((id: string) => {
    const c = CHOICES.find((x) => x.id === id);
    if (!c) return;
    setSelectiveSubConfig(c.value);
    setOpen(false);
  }, []);

  const active = cfg.enabled;
  const current = currentChoiceId(cfg);

  return (
    <div ref={rootRef} className={cn("absolute top-3 right-3 z-30", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${label}: ${shortLabel(cfg)}`}
        className={cn(
          "p-2 rounded-full backdrop-blur-md border transition active:scale-95 flex items-center gap-1",
          active
            ? "bg-violet-500/30 border-violet-300/50 text-white"
            : "bg-black/40 border-white/15 text-white/80 hover:text-white",
        )}
      >
        <Layers className="w-4 h-4" />
        <span className="text-[10px] font-semibold leading-none pr-1">{shortLabel(cfg)}</span>
      </button>
      {open && (
        <div
          role="menu"
          className="mt-2 min-w-[160px] rounded-xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          {CHOICES.map((c) => (
            <button
              key={c.id}
              role="menuitemradio"
              aria-checked={current === c.id}
              onClick={() => pick(c.id)}
              className={cn(
                "w-full px-3 py-2 text-left text-xs transition flex items-center justify-between gap-3",
                current === c.id
                  ? "bg-violet-500/30 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white",
              )}
            >
              <span>{c.label}</span>
              {current === c.id && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
