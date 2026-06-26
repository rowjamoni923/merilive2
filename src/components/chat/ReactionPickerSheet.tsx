import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Smile } from "lucide-react";

const QUICK = ["❤️", "😂", "😮", "😢", "🙏", "🔥"];

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  onOpenFullPicker?: () => void;
}

/**
 * Floating quick-react bar (iMessage/WhatsApp style). Opens above the long-pressed
 * message and dismisses on backdrop tap or selection.
 */
export function ReactionPickerSheet({ open, onClose, onPick, onOpenFullPicker }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/30 animate-fade-in flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="mb-24 sm:mb-0 bg-popover text-popover-foreground border border-border rounded-full shadow-2xl px-2 py-1.5 flex items-center gap-1 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {QUICK.map((e) => (
          <button
            key={e}
            type="button"
            className="w-10 h-10 rounded-full hover:bg-muted active:scale-90 transition-transform text-[22px] leading-none flex items-center justify-center"
            onClick={() => {
              onPick(e);
              onClose();
            }}
            aria-label={`React with ${e}`}
          >
            {e}
          </button>
        ))}
        {onOpenFullPicker && (
          <button
            type="button"
            className="w-10 h-10 rounded-full hover:bg-muted active:scale-90 transition-transform flex items-center justify-center text-muted-foreground"
            onClick={() => {
              onOpenFullPicker();
              onClose();
            }}
            aria-label="More emoji"
          >
            <Smile className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>,
    document.body
  );
}
