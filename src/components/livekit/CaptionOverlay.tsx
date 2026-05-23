/**
 * Pkg145 — Caption Overlay UI (Pkg116 consumer)
 *
 * Rolling on-screen captions for any LiveKit Room (call / live / party).
 * Listens to `window 'livekit-transcription'` (dispatched by livekitTranscription.ts)
 * and renders a stacked, ephemeral caption bar over the video surface.
 *
 * Per-user toggle persisted in localStorage. Zero new Supabase channels,
 * zero polls, zero cross-user DB reads. Rides Pkg116 `transcription` kill-switch
 * (if no STT agent is dispatched, no segments arrive → component renders nothing).
 */
import { memo, useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptionEvent } from "@/lib/livekitTranscription";

interface CaptionLine {
  /** Stable id from LiveKit segment, falls back to identity+text hash. */
  key: string;
  identity?: string;
  text: string;
  final: boolean;
  /** When this line is allowed to be culled (ms epoch). */
  expireAt: number;
}

const MAX_LINES = 3;
const FINAL_TTL_MS = 6000;
const INTERIM_TTL_MS = 4000;
const STORAGE_KEY = "merilive_captions_enabled_v1";

export interface CaptionOverlayProps {
  scope: "call" | "live" | "party";
  id: string | null | undefined;
  /** Tailwind position classes; defaults to bottom-center over video area. */
  className?: string;
  /** Hide toggle button (e.g. when host already renders one elsewhere). */
  hideToggle?: boolean;
}

function readEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    // Default ON when user has never toggled (Pkg196/M2): captions auto-render
    // whenever a LiveKit Agent publishes transcriptions. Users can still hide
    // them via the toggle button.
    return v == null ? true : v === "1";
  } catch {
    return true;
  }
}

function writeEnabled(v: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export const CaptionOverlay = memo(function CaptionOverlay({
  scope,
  id,
  className,
  hideToggle,
}: CaptionOverlayProps) {
  const [enabled, setEnabled] = useState<boolean>(readEnabled);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const linesRef = useRef<CaptionLine[]>([]);
  linesRef.current = lines;

  // Listen for transcription events scoped to this room.
  useEffect(() => {
    if (!enabled || !id) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TranscriptionEvent>).detail;
      if (!detail) return;
      if (detail.scope !== scope || detail.id !== id) return;
      if (!detail.segments?.length) return;

      setLines((prev) => {
        // Merge: replace any in-flight interim line with same identity+segmentId.
        let next = [...prev];
        const now = Date.now();
        for (const seg of detail.segments) {
          if (!seg.text?.trim()) continue;
          const key = `${detail.identity || "anon"}:${seg.id || seg.text}`;
          const expireAt = now + (seg.final ? FINAL_TTL_MS : INTERIM_TTL_MS);
          const idx = next.findIndex((l) => l.key === key);
          const line: CaptionLine = {
            key,
            identity: detail.identity,
            text: seg.text.trim(),
            final: seg.final,
            expireAt,
          };
          if (idx >= 0) next[idx] = line;
          else next.push(line);
        }
        // Drop expired then cap to MAX_LINES (newest at bottom).
        next = next.filter((l) => l.expireAt > now);
        if (next.length > MAX_LINES) next = next.slice(-MAX_LINES);
        return next;
      });
    };
    window.addEventListener("livekit-transcription", handler as EventListener);
    return () => {
      window.removeEventListener("livekit-transcription", handler as EventListener);
    };
  }, [enabled, scope, id]);

  // Lightweight cull loop: 1s tick to drop expired lines so the bar disappears
  // when speech stops. Bounded duration; no DB / network involved.
  useEffect(() => {
    if (!enabled) {
      setLines([]);
      return;
    }
    const t = setInterval(() => {
      const now = Date.now();
      if (linesRef.current.some((l) => l.expireAt <= now)) {
        setLines((prev) => prev.filter((l) => l.expireAt > now));
      }
    }, 1000);
    return () => clearInterval(t);
  }, [enabled]);

  return (
    <>
      {!hideToggle && (
        <button
          type="button"
          onClick={() => {
            setEnabled((v) => {
              const next = !v;
              writeEnabled(next);
              return next;
            });
          }}
          aria-pressed={enabled}
          aria-label={enabled ? "Hide captions" : "Show captions"}
          className={cn(
            "absolute top-3 right-3 z-30 p-2 rounded-full backdrop-blur-md border transition active:scale-95",
            enabled
              ? "bg-emerald-500/25 border-emerald-300/40 text-white"
              : "bg-black/40 border-white/15 text-white/70 hover:text-white"
          )}
        >
          {enabled ? <Captions className="w-4 h-4" /> : <CaptionsOff className="w-4 h-4" />}
        </button>
      )}

      {enabled && lines.length > 0 && (
        <div
          className={cn(
            "pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-28 z-20 w-[92%] max-w-md flex flex-col items-center gap-1",
            className
          )}
          role="status"
          aria-live="polite"
        >
          {lines.map((line) => (
            <div
              key={line.key}
              className={cn(
                "px-3 py-1.5 rounded-lg backdrop-blur-md text-center max-w-full",
                "bg-black/65 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.4)]",
                !line.final && "opacity-70 italic"
              )}
            >
              <span className="text-white text-[12px] leading-snug drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                {line.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
});
