/**
 * Pkg144 — Chat Attachment Buttons (image / voice / file)
 *
 * Reusable UI that rides Pkg142 senders (livekitChatAttachments) over Pkg121
 * Text/Byte Streams. Pure transport — caller is responsible for any persistence.
 *
 * Designed for any scope (call / live / party) — pass `scope` + `id` and the
 * three icon buttons start working: image picker, voice recorder, file picker.
 */
import { useRef, useState, memo } from "react";
import { ImagePlus, Mic, Paperclip, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  sendChatImage,
  sendChatVoice,
  sendChatFile,
} from "@/lib/livekitChatAttachments";
import type { StreamScope } from "@/lib/livekitStreams";

interface ChatAttachmentButtonsProps {
  scope: StreamScope;
  id: string;
  /** Called locally when YOU successfully send an attachment, so the UI can
   *  show your own bubble immediately (peers receive via livekit handler). */
  onLocalSent?: (kind: "image" | "voice" | "file", file: Blob, name?: string) => void;
  disabled?: boolean;
  className?: string;
}

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB hard ceiling

export const ChatAttachmentButtons = memo(function ChatAttachmentButtons({
  scope,
  id,
  onLocalSent,
  disabled,
  className,
}: ChatAttachmentButtonsProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState<null | "image" | "voice" | "file">(null);

  const guardSize = (file: Blob) => {
    if (file.size > MAX_BYTES) {
      toast.error(`File too large (max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB)`);
      return false;
    }
    return true;
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !guardSize(file)) return;
    setSending("image");
    try {
      await sendChatImage(scope, id, file, { name: file.name, mimeType: file.type });
      onLocalSent?.("image", file, file.name);
    } catch (err) {
      console.error("[ChatAttachment] image send failed", err);
      toast.error("Failed to send image");
    } finally {
      setSending(null);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !guardSize(file)) return;
    setSending("file");
    try {
      await sendChatFile(scope, id, file, { name: file.name, mimeType: file.type });
      onLocalSent?.("file", file, file.name);
    } catch (err) {
      console.error("[ChatAttachment] file send failed", err);
      toast.error("Failed to send file");
    } finally {
      setSending(null);
    }
  };

  const startRecording = async () => {
    if (recording || sending) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recordChunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(recordChunksRef.current, { type: mime });
        recordStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordStreamRef.current = null;
        if (!guardSize(blob)) return;
        setSending("voice");
        try {
          const name = `voice-${Date.now()}.webm`;
          await sendChatVoice(scope, id, blob, { name, mimeType: mime });
          onLocalSent?.("voice", blob, name);
        } catch (err) {
          console.error("[ChatAttachment] voice send failed", err);
          toast.error("Failed to send voice note");
        } finally {
          setSending(null);
        }
      };
      rec.start();
      mediaRecorderRef.current = rec;
      setRecording(true);
    } catch (err) {
      console.error("[ChatAttachment] mic permission failed", err);
      toast.error("Microphone permission denied");
    }
  };

  const stopRecording = () => {
    if (!recording) return;
    try {
      mediaRecorderRef.current?.stop();
    } catch {/* ignore */}
    mediaRecorderRef.current = null;
    setRecording(false);
  };

  const btn =
    "p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 active:scale-95 transition disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImagePick}
      />
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFilePick}
      />

      <button
        type="button"
        onClick={() => imageInputRef.current?.click()}
        disabled={disabled || !!sending || recording}
        className={btn}
        aria-label="Send image"
      >
        {sending === "image" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
      </button>

      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled || !!sending}
        className={cn(btn, recording && "text-red-400 bg-red-500/15 animate-pulse")}
        aria-label={recording ? "Stop recording" : "Record voice note"}
      >
        {sending === "voice" ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : recording ? (
          <Square className="w-4 h-4 fill-current" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled || !!sending || recording}
        className={btn}
        aria-label="Send file"
      >
        {sending === "file" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
      </button>
    </div>
  );
});
