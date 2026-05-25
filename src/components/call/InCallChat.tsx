import { useState, useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { RoomChatBubble } from "@/components/chat/UnifiedChatMessage";
import {
  publishChatMessage,
  type ChatMessageDetail,
} from "@/lib/livekitChatSignaling";

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  message: string;
  timestamp: number;
}

interface InCallChatProps {
  isOpen: boolean;
  onClose: () => void;
  callId: string | null;
  userId: string | null;
  remoteUserId: string | null;
  remoteUserName: string;
  userName?: string;
}

export const InCallChat = memo(({
  isOpen,
  onClose,
  callId,
  userId,
  remoteUserId,
  remoteUserName,
  userName = "You",
}: InCallChatProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Pkg79: LiveKit DataPacket chat — replaces the Supabase
  // `call-chat-${callId}` broadcast channel entirely. The LiveKit Room is
  // already registered by useLiveKitCall on connect; we only listen here.
  useEffect(() => {
    if (!callId || !isOpen) return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<ChatMessageDetail>).detail;
      if (!detail) return;
      if (detail.scope !== 'call' || detail.id !== callId) return;
      if (detail.userId === userId) return;
      const msg: ChatMessage = {
        id: detail.messageId,
        senderId: detail.userId,
        senderName: detail.displayName || "User",
        message: detail.message,
        timestamp: detail.timestamp || Date.now(),
      };
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };
    window.addEventListener('livekit-chat-message', handler as EventListener);
    return () => {
      window.removeEventListener('livekit-chat-message', handler as EventListener);
    };
  }, [callId, isOpen, userId]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !callId || !userId) return;

    let actualName = userName;
    if (userName === "You") {
      const { data } = await supabase
        // guard-ok: own profile self-read for display_name (userId === auth.uid())
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .single();

      if (data?.display_name) actualName = data.display_name;
    }

    const msgId = `${Date.now()}-${userId}`;
    const msg: ChatMessage = {
      id: msgId,
      senderId: userId,
      senderName: actualName,
      message: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, msg]);
    setInput("");

    void publishChatMessage('call', callId, {
      messageId: msgId,
      userId,
      displayName: actualName,
      message: text,
      messageType: 'text',
      timestamp: msg.timestamp,
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="absolute bottom-44 left-3 right-3 z-30 max-h-[45vh] flex flex-col rounded-[20px] overflow-hidden bg-black/65 backdrop-blur-xl border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.4)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-white/[0.04] to-transparent">
            <span className="text-white/95 text-[13px] font-semibold tracking-tight">
              Chat with {remoteUserName}
            </span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-white/15 flex items-center justify-center active:scale-95 transition"
              aria-label="Close"
            >
              <X className="w-[18px] h-[18px] text-white/70" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 min-h-[140px] max-h-[30vh]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {messages.length === 0 && (
              <p className="text-white/40 text-xs text-center py-6">
                Send a message to start chatting…
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.senderId === userId;
              return (
                <div key={msg.id} className={cn("w-full flex", isMe ? "justify-end" : "justify-start")}>
                  <RoomChatBubble
                    id={msg.id}
                    userName={isMe ? "You" : msg.senderName}
                    message={msg.message}
                    userLevel={1}
                    isHost={false}
                  />
                </div>
              );
            })}
          </div>

          {/* Input — Bigo-style pill + circular send */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-t border-white/10 bg-gradient-to-r from-white/[0.03] to-transparent">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message…"
              className="flex-1 bg-white/[0.08] text-white text-[13px] px-4 py-2.5 rounded-full outline-none placeholder:text-white/35 border border-white/10 focus:border-purple-400/60 focus:bg-white/[0.12] transition"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-fuchsia-500 via-purple-500 to-violet-600 text-white disabled:opacity-30 active:scale-95 transition flex items-center justify-center shadow-md shadow-purple-500/40"
              aria-label="Send"
            >
              <Send className="w-[18px] h-[18px]" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

InCallChat.displayName = "InCallChat";
