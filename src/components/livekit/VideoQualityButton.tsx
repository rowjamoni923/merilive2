/**
 * Pkg149 — Floating quality picker (Phase 2 #6)
 *
 * Lets viewers cap their incoming simulcast layer (Auto / 240p / 480p / 720p+).
 * Pure client preference; useLiveKitClient re-applies on every preference change
 * and on every new TrackSubscribed/TrackPublished event.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VIDEO_QUALITY_CHANGED_EVENT,
  VIDEO_QUALITY_LABELS,
  getVideoQualityChoice,
  setVideoQualityChoice,
  type VideoQualityChoice,
} from "@/lib/livekitVideoQuality";

export interface VideoQualityButtonProps {
  className?: string;
  label?: string;
}

const CHOICES: VideoQualityChoice[] = ["auto", "low", "medium", "high"];

export const VideoQualityButton = memo(function VideoQualityButton({
  className,
  label = "Video quality",
}: VideoQualityButtonProps) {
  const [choice, setChoice] = useState<VideoQualityChoice>(() => getVideoQualityChoice());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ choice: VideoQualityChoice }>).detail;
      if (detail?.choice) setChoice(detail.choice);
      else setChoice(getVideoQualityChoice());
    };
    window.addEventListener(VIDEO_QUALITY_CHANGED_EVENT, onChange as EventListener);
    return () => window.removeEventListener(VIDEO_QUALITY_CHANGED_EVENT, onChange as EventListener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = useCallback((next: VideoQualityChoice) => {
    setVideoQualityChoice(next);
    setChoice(next);
    setOpen(false);
  }, []);

  return (
    <div ref={rootRef} className={cn("absolute top-3 left-24 z-30", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${label}: ${VIDEO_QUALITY_LABELS[choice]}`}
        className={cn(
          "p-2 rounded-full backdrop-blur-md border transition active:scale-95 flex items-center gap-1",
          choice === "auto"
            ? "bg-black/40 border-white/15 text-white/80 hover:text-white"
            : "bg-sky-500/30 border-sky-300/50 text-white",
        )}
      >
        <Gauge className="w-4 h-4" />
        <span className="text-[10px] font-semibold leading-none pr-1">
          {VIDEO_QUALITY_LABELS[choice]}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="mt-2 min-w-[120px] rounded-xl border border-white/15 bg-black/80 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          {CHOICES.map((c) => (
            <button
              key={c}
              role="menuitemradio"
              aria-checked={choice === c}
              onClick={() => pick(c)}
              className={cn(
                "w-full px-3 py-2 text-left text-xs transition flex items-center justify-between",
                choice === c
                  ? "bg-sky-500/30 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white",
              )}
            >
              <span>{VIDEO_QUALITY_LABELS[c]}</span>
              {choice === c && <span aria-hidden>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
