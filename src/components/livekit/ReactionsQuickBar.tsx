/**
 * Pkg132 UI polish: ReactionsQuickBar
 * --------------------------------------------------------------
 * Inline horizontal floating emoji bar (1-tap send, no sheet).
 * UX mirrors LinkedIn Live / TikTok Live — bar slides up next to
 * the trigger, tap an emoji to fire instantly, bar auto-collapses
 * after 4s of inactivity. Pkg132 rate-limit + kill-switch live
 * inside `publishReaction`; UI just toasts on refusal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { publishReaction, type ReactionScope } from "@/lib/livekitReactions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👏"] as const;
const AUTO_HIDE_MS = 4000;

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ReactionScope;
  id: string | null | undefined;
  /** px from bottom — defaults to 80 (above bottom action row) */
  bottomOffset?: number;
  /** px from left — defaults to 72 (right of trigger button) */
  leftOffset?: number;
}

export function ReactionsQuickBar({
  open,
  onClose,
  scope,
  id,
  bottomOffset = 80,
  leftOffset = 72,
}: Props) {
  const [burst, setBurst] = useState<string | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => onClose(), AUTO_HIDE_MS);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [open, scheduleHide]);

  const handlePick = useCallback(
    async (emoji: string) => {
      if (!id) return;
      setBurst(emoji);
      setTimeout(() => setBurst(null), 350);
      const ok = await publishReaction(scope, id, emoji);
      if (!ok) toast.error("Slow down — too many reactions");
      scheduleHide();
    },
    [id, scope, scheduleHide],
  );

  if (!open) return null;

  return (
    <div
      className="fixed z-[56] flex items-center gap-1.5 px-2 py-1.5 rounded-full bg-background/80 backdrop-blur-xl border border-border shadow-2xl animate-in slide-in-from-left-4 fade-in duration-200"
      style={{ bottom: bottomOffset, left: leftOffset }}
      role="toolbar"
      aria-label="Quick reactions"
    >
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => handlePick(e)}
          className={cn(
            "w-10 h-10 rounded-full text-2xl flex items-center justify-center transition-transform",
            "hover:scale-125 active:scale-95",
            burst === e && "animate-ping-once scale-150",
          )}
          aria-label={`Send ${e} reaction`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

export default ReactionsQuickBar;
