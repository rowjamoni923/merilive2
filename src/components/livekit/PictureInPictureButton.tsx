/**
 * Pkg146 — Picture-in-Picture Button
 *
 * Floating button that toggles the standard browser Picture-in-Picture API
 * on a <LiveKitVideoPlayer enablePictureInPicture pipId="..." />.
 *
 * Pairs to the `<video data-pip-id="...">` rendered by LiveKitVideoPlayer.
 *
 * - Auto-hides on browsers that don't support PiP (Firefox Android, Capacitor WebView).
 * - Listens to enter/leavepictureinpicture so the toggle stays in sync if the
 *   user closes the PiP window manually.
 * - Zero new Supabase channels, zero polls, zero cross-user reads.
 */
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { PictureInPicture2, PictureInPicture } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PictureInPictureButtonProps {
  /** Matches LiveKitVideoPlayer's `pipId` prop. */
  pipId: string;
  /** Tailwind class for positioning (defaults to top-left floating). */
  className?: string;
  /** Optional label for screen readers. */
  label?: string;
}

function isPipSupported(): boolean {
  if (typeof document === "undefined") return false;
  // Standard <video> PiP (Chrome/Edge/Safari desktop, Safari iOS, Chrome Android partial)
  return (
    "pictureInPictureEnabled" in document &&
    (document as Document & { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true
  );
}

function findVideoEl(pipId: string): HTMLVideoElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLVideoElement>(`video[data-pip-id="${CSS.escape(pipId)}"]`);
}

export const PictureInPictureButton = memo(function PictureInPictureButton({
  pipId,
  className,
  label = "Picture-in-picture",
}: PictureInPictureButtonProps) {
  const [supported] = useState<boolean>(isPipSupported);
  const [active, setActive] = useState<boolean>(false);
  const lastVideoRef = useRef<HTMLVideoElement | null>(null);

  // Track enter/leave events on whichever video this button currently controls.
  useEffect(() => {
    if (!supported) return;
    const onEnter = (e: Event) => {
      if ((e.target as HTMLVideoElement).dataset?.pipId === pipId) setActive(true);
    };
    const onLeave = (e: Event) => {
      if ((e.target as HTMLVideoElement).dataset?.pipId === pipId) setActive(false);
    };
    document.addEventListener("enterpictureinpicture", onEnter, true);
    document.addEventListener("leavepictureinpicture", onLeave, true);
    return () => {
      document.removeEventListener("enterpictureinpicture", onEnter, true);
      document.removeEventListener("leavepictureinpicture", onLeave, true);
    };
  }, [pipId, supported]);

  const toggle = useCallback(async () => {
    if (!supported) return;
    try {
      const doc = document as Document & {
        pictureInPictureElement?: Element | null;
        exitPictureInPicture?: () => Promise<void>;
      };
      if (doc.pictureInPictureElement && lastVideoRef.current === doc.pictureInPictureElement) {
        await doc.exitPictureInPicture?.();
        return;
      }
      // Exit any other PiP first.
      if (doc.pictureInPictureElement) {
        try { await doc.exitPictureInPicture?.(); } catch { /* ignore */ }
      }
      const v = findVideoEl(pipId);
      if (!v) return;
      lastVideoRef.current = v;
      // Some browsers require non-muted audio to enter PiP; LiveKit videos start muted,
      // but PiP works on video-only tracks regardless. requestPictureInPicture on a
      // muted element is allowed for Chrome/Edge/Safari.
      const anyV = v as HTMLVideoElement & { requestPictureInPicture?: () => Promise<PictureInPictureWindow> };
      if (typeof anyV.requestPictureInPicture === "function") {
        await anyV.requestPictureInPicture();
      }
    } catch {
      // User gesture / permission / unsupported — silent fail.
    }
  }, [pipId, supported]);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "absolute top-3 left-3 z-30 p-2 rounded-full backdrop-blur-md border transition active:scale-95",
        active
          ? "bg-indigo-500/30 border-indigo-300/50 text-white"
          : "bg-black/40 border-white/15 text-white/80 hover:text-white",
        className,
      )}
    >
      {active ? (
        <PictureInPicture className="w-4 h-4" />
      ) : (
        <PictureInPicture2 className="w-4 h-4" />
      )}
    </button>
  );
});
