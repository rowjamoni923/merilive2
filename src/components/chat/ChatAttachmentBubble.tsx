/**
 * Pkg144 — Renders a received/sent chat attachment bubble.
 * Image → inline thumbnail, Voice → <audio>, File → download link.
 */
import { memo, useMemo } from "react";
import { Paperclip, Download } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatAttachmentBubbleProps {
  kind: "image" | "voice" | "file";
  bytes: Uint8Array | Blob;
  mimeType?: string;
  name?: string;
  isMe?: boolean;
}

export const ChatAttachmentBubble = memo(function ChatAttachmentBubble({
  kind,
  bytes,
  mimeType,
  name,
  isMe,
}: ChatAttachmentBubbleProps) {
  const url = useMemo(() => {
    const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mimeType || "application/octet-stream" });
    return URL.createObjectURL(blob);
  }, [bytes, mimeType]);

  // Note: URL.revokeObjectURL skipped — bubbles live for session duration; trade-off ok.

  if (kind === "image") {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-block max-w-[200px] rounded-xl overflow-hidden border border-white/20 shadow-md",
          isMe && "ml-auto"
        )}
      >
        <img src={url} alt={name || "image"} className="w-full h-auto object-cover" />
      </a>
    );
  }

  if (kind === "voice") {
    return (
      <audio
        src={url}
        controls
        className={cn("max-w-[220px] rounded-full", isMe && "ml-auto")}
      />
    );
  }

  return (
    <a
      href={url}
      download={name || "file"}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white/90 text-xs hover:bg-white/15 transition",
        isMe && "ml-auto"
      )}
    >
      <Paperclip className="w-4 h-4 shrink-0" />
      <span className="truncate max-w-[140px]">{name || "Attachment"}</span>
      <Download className="w-3.5 h-3.5 opacity-60" />
    </a>
  );
});
