/**
 * Pkg132 UI: Reaction Picker Sheet
 * --------------------------------------------------------------
 * Bottom sheet with the standard 6-emoji reaction set
 * (industry standard: Zoom / Meet / LinkedIn Live / TikTok).
 * Tapping an emoji publishes via Pkg132 `publishReaction` and
 * closes the sheet. Local Pkg132 rate-limit + kill-switch enforced
 * inside the lib — UI just shows a toast when send is refused.
 */
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { publishReaction, type ReactionScope } from "@/lib/livekitReactions";
import { toast } from "sonner";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "🔥", "👏"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  scope: ReactionScope;
  id: string | null | undefined;
}

export function ReactionPickerSheet({ open, onClose, scope, id }: Props) {
  const handlePick = async (emoji: string) => {
    if (!id) {
      onClose();
      return;
    }
    const ok = await publishReaction(scope, id, emoji);
    if (!ok) {
      toast.error("Slow down — too many reactions");
    }
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl border-t border-border bg-background/95 backdrop-blur-xl">
        <SheetHeader>
          <SheetTitle>Send a reaction</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-6 gap-2 py-6">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => handlePick(e)}
              className="aspect-square rounded-2xl bg-muted/40 hover:bg-muted/70 active:scale-95 transition text-4xl flex items-center justify-center"
              aria-label={`Send ${e} reaction`}
            >
              {e}
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default ReactionPickerSheet;
