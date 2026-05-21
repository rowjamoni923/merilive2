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
      // Don't duplicate own messages (we already added them optimistically).
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

    // Fetch actual display name if userName is default
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

    // Add locally immediately
    setMessages((prev) => [...prev, msg]);
    setInput("");

    // Pkg79: publish over LiveKit DataPacket — sub-50ms peer delivery.
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
          className="absolute bottom-44 left-3 right-3 z-30 max-h-[45vh] flex flex-col rounded-2xl overflow-hidden bg-black/60 backdrop-blur-xl border border-white/15"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="text-white/90 text-xs font-semibold">
              Chat with {remoteUserName}
            </span>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
              <X className="w-4 h-4 text-white/60" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={chatRef}
            className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[120px] max-h-[30vh]"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {messages.length === 0 && (
              <p className="text-white/30 text-xs text-center py-4">
                Send a message...
              </p>
            )}
            {messages.map((msg) => {
              const isMe = msg.senderId === userId;
              return (
                <div key={msg.id} className={cn("w-full", isMe && "text-right")}>
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

          {/* Input */}
          <div className="flex items-center gap-2 px-3 py-2 border-t border-white/10">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 bg-white/10 text-white text-xs px-3 py-2 rounded-full outline-none placeholder:text-white/30 border border-white/10 focus:border-purple-500/50"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="p-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white disabled:opacity-30 active:scale-95 transition-transform"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

InCallChat.displayName = "InCallChat";
