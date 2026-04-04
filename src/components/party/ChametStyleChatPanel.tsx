import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getLevelGradient, ensureValidLevel, formatLevel } from "@/features/shared/level";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userLevel: number;
  message: string;
  type?: 'text' | 'system' | 'gift' | 'entrance' | 'join';
  timestamp: Date;
}

interface ChametStyleChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  currentUserId?: string;
}

// Quick emoji row matching Chamet
const quickEmojis = ['😊', '🥰', '😍', '😘', '🤩', '🥳', '😭'];

export const ChametStyleChatPanel = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId
}: ChametStyleChatPanelProps) => {
  const [inputValue, setInputValue] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const handleSend = () => {
    if (inputValue.trim()) {
      onSendMessage(inputValue.trim());
      setInputValue("");
      // Auto close panel after sending
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addEmoji = (emoji: string) => {
    setInputValue(prev => prev + emoji);
    inputRef.current?.focus();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
          style={{ height: "60vh" }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 -z-10"
            onClick={onClose}
          />

          {/* Chat Container */}
          <div className="flex flex-col h-full bg-gradient-to-b from-purple-900/95 to-black/95 backdrop-blur-xl rounded-t-3xl border-t border-white/10">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-semibold text-lg">Chat</h3>
              <Button
                size="icon"
                variant="ghost"
                className="w-8 h-8 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg) => {
                const level = ensureValidLevel(msg.userLevel);
                // Extract gift icon from message if it's a gift type
                const giftIconMatch = msg.message.match(/\[GIFT:([^\]]*)\]/);
                const giftIconUrl = giftIconMatch ? giftIconMatch[1] : null;
                const cleanMessage = msg.message.replace(/\[GIFT:[^\]]*\]\s*/, '');
                const isGiftMessage = msg.type === 'gift' || giftIconMatch;
                
                return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "py-2 px-3 rounded-xl max-w-[90%]",
                    msg.type === 'system' 
                      ? "bg-purple-800/50 border border-purple-500/30"
                      : isGiftMessage
                        ? "bg-gradient-to-r from-pink-600/60 to-purple-600/60"
                        : msg.userId === currentUserId
                          ? "bg-gradient-to-r from-purple-600/60 to-pink-600/60 ml-auto"
                          : "bg-white/10"
                  )}
                >
                  {msg.type === 'system' ? (
                    <p className="text-purple-200 text-sm">{msg.message}</p>
                  ) : msg.type === 'join' ? (
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0",
                        getLevelGradient(level)
                      )}>
                        ✦{formatLevel(level)}
                      </Badge>
                      <span className="text-green-400 font-medium text-xs">{msg.userName}</span>
                      <span className="text-green-300/80 text-xs">joined the room 🎉</span>
                    </div>
                  ) : isGiftMessage ? (
                    <div className="flex items-center gap-2">
                      <Badge className={cn(
                        "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0",
                        getLevelGradient(level)
                      )}>
                        ✦{formatLevel(level)}
                      </Badge>
                      <span className="text-pink-400 font-medium text-xs">{msg.userName}</span>
                      {giftIconUrl && (
                        <img src={giftIconUrl} alt="Gift" className="w-5 h-5 object-contain" />
                      )}
                      <span className="text-white/90 text-xs">{cleanMessage}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={cn(
                          "bg-gradient-to-r text-white text-[9px] px-1.5 h-4 border-0",
                          getLevelGradient(level)
                        )}>
                          ✦{formatLevel(level)}
                        </Badge>
                        <span className="text-pink-400 font-medium text-xs">{msg.userName}</span>
                      </div>
                      <p className="text-white text-sm">{msg.message}</p>
                    </div>
                  )}
                </motion.div>
              )})}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Emoji Row */}
            <div className="flex items-center gap-3 px-4 py-2 border-t border-white/10 overflow-x-auto">
              {quickEmojis.map((emoji, i) => (
                <button
                  key={i}
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl hover:scale-125 transition-transform flex-shrink-0"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Input Area */}
            <div className="px-4 py-3 pb-safe bg-white/5">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type something..."
                    className="w-full bg-white rounded-full px-5 py-3 pr-12 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <Smile className="w-5 h-5" />
                  </button>
                </div>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50"
                >
                  <Send className="w-5 h-5 text-white" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChametStyleChatPanel;
