import React from "react";
import { MessageSquareReply } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSwipeToReply } from "@/hooks/useSwipeToReply";

interface Props {
  id: string;
  isMine: boolean;
  sameAsPrev: boolean | null | undefined;
  onReply: () => void;
  children: React.ReactNode;
}

/**
 * Per-message row shell that adds WhatsApp-style swipe-to-reply.
 * - Right swipe for peer messages.
 * - Left swipe for own messages.
 * - Reply icon fades/scales in behind the bubble as the user pulls.
 */
export function MessageRowShell({ id, isMine, sameAsPrev, onReply, children }: Props) {
  const { rowRef, swipeProps } = useSwipeToReply({ isMine, onReply });

  return (
    <div
      id={id}
      className={cn(
        "chat-msg-row relative flex gap-2 group",
        isMine ? "justify-end" : "justify-start",
        sameAsPrev ? "mt-0.5" : "mt-2"
      )}
    >
      {/* Reply hint that the bubble reveals as you swipe */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center transition-opacity",
          isMine ? "right-1" : "left-1"
        )}
        style={{
          opacity: "var(--reply-progress, 0)",
          transform: `translateY(-50%) scale(calc(0.6 + var(--reply-progress, 0) * 0.4))`,
        }}
      >
        <MessageSquareReply className="w-4 h-4" />
      </span>

      <div
        ref={rowRef}
        {...swipeProps}
        className={cn("flex gap-2 max-w-[92%] min-w-0 will-change-transform", isMine && "flex-row-reverse")}
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
