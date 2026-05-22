/**
 * Pkg147 — Audio-only viewer toggle
 *
 * Floating button that flips the global audio-only data-saver preference.
 * Reads/writes via livekitAudioOnlyMode helper. useLiveKitClient listens to
 * the dispatched event and unsubscribes/resubscribes video tracks live.
 */
import { memo, useCallback, useEffect, useState } from "react";
import { Headphones, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AUDIO_ONLY_CHANGED_EVENT,
  isAudioOnlyEnabled,
  setAudioOnlyEnabled,
} from "@/lib/livekitAudioOnlyMode";

export interface AudioOnlyToggleButtonProps {
  className?: string;
  label?: string;
}

export const AudioOnlyToggleButton = memo(function AudioOnlyToggleButton({
  className,
  label = "Audio-only data saver",
}: AudioOnlyToggleButtonProps) {
  const [enabled, setEnabled] = useState<boolean>(() => isAudioOnlyEnabled());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled: boolean }>).detail;
      if (detail && typeof detail.enabled === "boolean") setEnabled(detail.enabled);
      else setEnabled(isAudioOnlyEnabled());
    };
    window.addEventListener(AUDIO_ONLY_CHANGED_EVENT, onChange as EventListener);
    return () => window.removeEventListener(AUDIO_ONLY_CHANGED_EVENT, onChange as EventListener);
  }, []);

  const toggle = useCallback(() => {
    const next = !isAudioOnlyEnabled();
    setAudioOnlyEnabled(next);
    setEnabled(next);
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={label}
      title={enabled ? "Audio-only on — tap to show video" : "Tap to switch to audio-only"}
      className={cn(
        "absolute top-3 left-14 z-30 p-2 rounded-full backdrop-blur-md border transition active:scale-95",
        enabled
          ? "bg-emerald-500/30 border-emerald-300/50 text-white"
          : "bg-black/40 border-white/15 text-white/80 hover:text-white",
        className,
      )}
    >
      {enabled ? <Headphones className="w-4 h-4" /> : <Video className="w-4 h-4" />}
    </button>
  );
});
