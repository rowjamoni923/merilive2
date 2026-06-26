import { cn } from "@/lib/utils";
import type { ReactionAgg } from "@/hooks/useMessageReactions";

interface Props {
  reactions: ReactionAgg[];
  isMine: boolean;
  onToggle: (emoji: string) => void;
}

/**
 * Aggregated reaction chips below a message bubble (WhatsApp/iMessage style).
 * Tapping an existing chip toggles your reaction.
 */
export function ReactionBar({ reactions, isMine, onToggle }: Props) {
  if (!reactions || reactions.length === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap gap-1 -mt-1.5 relative z-[1]",
        isMine ? "justify-end pr-1" : "justify-start pl-1"
      )}
    >
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle(r.emoji);
          }}
          className={cn(
            "inline-flex items-center gap-0.5 h-6 px-1.5 rounded-full border text-[12px] leading-none shadow-sm transition-transform active:scale-95",
            r.mine
              ? "bg-primary/15 border-primary/40 text-foreground"
              : "bg-card/95 border-border text-foreground"
          )}
          aria-label={`Reaction ${r.emoji}, ${r.count}${r.mine ? ", you reacted" : ""}`}
        >
          <span>{r.emoji}</span>
          {r.count > 1 && (
            <span className="text-[10px] font-semibold text-muted-foreground">{r.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
