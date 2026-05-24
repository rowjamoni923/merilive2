import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smile, Send, X, Crown, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { getLevelGradient, ensureValidLevel, formatLevel } from "@/features/shared/level";
import { normalizeGiftMediaUrl } from "@/utils/giftMediaUrl";

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userLevel: number;
  message: string;
  type?: 'text' | 'system' | 'gift' | 'entrance' | 'join';
  timestamp: Date;
  isHost?: boolean;
  isVip?: boolean;
}

interface ChametStyleChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  currentUserId?: string;
  hostId?: string;
}

// Chamet-style quick emoji row
const quickEmojis = ['😊', '🥰', '😍', '😘', '🤩', '🥳', '😭', '🔥', '❤️', '👏'];

/* Premium easing curves (Chamet/Bigo-parity) */
const SPRING_FAST = { type: "spring" as const, damping: 28, stiffness: 380, mass: 0.6 };
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/* Name color tiers — Chamet uses gold for host, purple for VIP, level-gradient for rest */
const getNameColor = (msg: ChatMessage, isHost: boolean) => {
  if (isHost) return "text-amber-300";
  if (msg.isVip) return "text-fuchsia-300";
  if (msg.userLevel >= 30) return "text-cyan-300";
  if (msg.userLevel >= 15) return "text-pink-300";
  return "text-purple-200";
};

export const ChametStyleChatPanel = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId,
  hostId,
}: ChametStyleChatPanelProps) => {
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Smooth bottom-anchor scroll on new messages
  useEffect(() => {
    if (!isOpen) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    });
  }, [messages, isOpen]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleSend = () => {
    const v = inputValue.trim();
    if (!v) return;
    onSendMessage(v);
    setInputValue("");
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
          initial={{ y: "100%", opacity: 0.6 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0.4 }}
          transition={SPRING_FAST}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col will-change-transform"
          style={{
            height: "58vh",
            transform: "translateZ(0)",
          }}
        >
          {/* Light tap-to-close layer — does NOT block video view */}
          <div
            className="fixed inset-0 -z-10"
            style={{ background: "transparent" }}
            onClick={onClose}
          />

          {/* Chat Container — premium glassmorphism, no full video blur */}
          <div
            className="flex flex-col h-full rounded-t-[28px] relative overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(10,6,28,0.72) 0%, rgba(8,4,20,0.92) 35%, rgba(6,3,16,0.97) 100%)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderTop: "1px solid rgba(168,85,247,0.18)",
              boxShadow: "0 -20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Top shimmer line */}
            <motion.div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-px rounded-full"
              style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.55), transparent)" }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2.6, repeat: Infinity }}
            />

            {/* Header — pill grip + title + close */}
            <div className="flex items-center justify-between px-5 py-3 relative">
              <div className="absolute left-1/2 -translate-x-1/2 top-1.5 w-10 h-1 rounded-full bg-white/15" />
              <h3 className="text-white font-bold text-[15px] tracking-tight mt-2">Live Chat</h3>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onClose}
                className="mt-2 w-8 h-8 rounded-full flex items-center justify-center bg-white/8 border border-white/10"
              >
                <X className="w-4 h-4 text-white/70" />
              </motion.button>
            </div>

            {/* Messages — gradient fade mask top + smooth scroll */}
            <div className="relative flex-1 min-h-0">
              {/* Top fade mask */}
              <div
                className="pointer-events-none absolute top-0 left-0 right-0 h-8 z-10"
                style={{ background: "linear-gradient(180deg, rgba(6,3,16,0.95), transparent)" }}
              />

              <div
                ref={scrollContainerRef}
                className="h-full overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2 scroll-smooth"
                style={{
                  scrollbarWidth: "thin",
                  scrollbarColor: "rgba(168,85,247,0.3) transparent",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                {messages.map((msg, idx) => {
                  const level = ensureValidLevel(msg.userLevel);
                  const giftIconMatch = msg.message.match(/\[GIFT:([^\]]*)\]/);
                  const giftIconUrl = normalizeGiftMediaUrl(giftIconMatch?.[1]);
                  const cleanMessage = msg.message.replace(/\[GIFT:[^\]]*\]\s*/, '');
                  const isGiftMessage = msg.type === 'gift' || !!giftIconMatch;
                  const isHostMsg = !!(hostId && msg.userId === hostId) || !!msg.isHost;
                  const isSelf = msg.userId === currentUserId;
                  const nameColor = getNameColor(msg, isHostMsg);

                  // System message
                  if (msg.type === 'system') {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.22, ease: EASE_OUT }}
                        className="mx-auto max-w-[80%] text-center"
                      >
                        <span
                          className="inline-block text-purple-200/85 text-[11px] px-3 py-1 rounded-full"
                          style={{
                            background: "rgba(168,85,247,0.12)",
                            border: "1px solid rgba(168,85,247,0.18)",
                          }}
                        >
                          {msg.message}
                        </span>
                      </motion.div>
                    );
                  }

                  // Join / Entrance message
                  if (msg.type === 'join' || msg.type === 'entrance') {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.32, ease: EASE_OUT }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-2xl max-w-[92%]"
                        style={{
                          background: "linear-gradient(90deg, rgba(34,197,94,0.18), rgba(16,185,129,0.08))",
                          border: "1px solid rgba(74,222,128,0.22)",
                        }}
                      >
                        <span
                          className={cn(
                            "text-[9px] font-black px-1.5 py-px rounded text-white bg-gradient-to-r leading-none",
                            getLevelGradient(level)
                          )}
                        >
                          ✦{formatLevel(level)}
                        </span>
                        <span className="text-emerald-300 font-bold text-[12px] truncate">{msg.userName}</span>
                        <span className="text-emerald-200/80 text-[11px]">joined 🎉</span>
                      </motion.div>
                    );
                  }

                  // Gift message
                  if (isGiftMessage) {
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, scale: 0.92, y: 8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.3, ease: EASE_OUT }}
                        className="flex items-center gap-2 px-3 py-2 rounded-2xl max-w-[92%] relative overflow-hidden"
                        style={{
                          background: "linear-gradient(90deg, rgba(236,72,153,0.28), rgba(168,85,247,0.18))",
                          border: "1px solid rgba(236,72,153,0.35)",
                          boxShadow: "0 4px 16px rgba(236,72,153,0.18)",
                        }}
                      >
                        {/* Subtle shimmer */}
                        <motion.div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
                          }}
                          animate={{ x: ["-100%", "200%"] }}
                          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
                        />
                        <span
                          className={cn(
                            "text-[9px] font-black px-1.5 py-px rounded text-white bg-gradient-to-r leading-none relative z-10",
                            getLevelGradient(level)
                          )}
                        >
                          ✦{formatLevel(level)}
                        </span>
                        <span className={cn("font-bold text-[12px] truncate relative z-10", nameColor)}>
                          {msg.userName}
                        </span>
                        {giftIconUrl && (
                          <img src={giftIconUrl} alt="" className="w-5 h-5 object-contain relative z-10 drop-shadow" />
                        )}
                        <span className="text-white/95 text-[12px] relative z-10 truncate">{cleanMessage}</span>
                      </motion.div>
                    );
                  }

                  // Regular text message — single-row Chamet style
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, x: isSelf ? 12 : -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.24, ease: EASE_OUT }}
                      className={cn(
                        "flex items-start gap-1.5 px-3 py-1.5 rounded-2xl max-w-[92%]",
                        isSelf ? "ml-auto" : ""
                      )}
                      style={{
                        background: isSelf
                          ? "linear-gradient(135deg, rgba(168,85,247,0.32), rgba(236,72,153,0.20))"
                          : "rgba(255,255,255,0.06)",
                        border: isSelf
                          ? "1px solid rgba(168,85,247,0.32)"
                          : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <span
                        className={cn(
                          "text-[9px] font-black px-1.5 py-px rounded text-white bg-gradient-to-r leading-none mt-0.5 flex-shrink-0",
                          getLevelGradient(level)
                        )}
                      >
                        ✦{formatLevel(level)}
                      </span>
                      {isHostMsg && (
                        <Crown className="w-3 h-3 text-amber-400 mt-1 flex-shrink-0 drop-shadow-[0_0_4px_rgba(251,191,36,0.7)]" />
                      )}
                      <span className={cn("font-bold text-[12px] flex-shrink-0 mt-0.5", nameColor)}>
                        {msg.userName}:
                      </span>
                      <span className="text-white/95 text-[13px] leading-snug break-words">{msg.message}</span>
                    </motion.div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Quick Emoji Row */}
            <div
              className="flex items-center gap-2 px-4 py-2 overflow-x-auto scrollbar-none"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              {quickEmojis.map((emoji, i) => (
                <motion.button
                  key={i}
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ scale: 1.15 }}
                  onClick={() => addEmoji(emoji)}
                  className="text-2xl flex-shrink-0 leading-none"
                >
                  {emoji}
                </motion.button>
              ))}
            </div>

            {/* Input Area */}
            <div
              className="px-3 py-3 pb-safe"
              style={{
                background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.06))",
                borderTop: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex-1 relative rounded-full transition-all duration-200",
                    "focus-within:[box-shadow:0_0_0_2px_rgba(168,85,247,0.55),0_0_18px_rgba(168,85,247,0.35)]"
                  )}
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.06))",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Say something nice…"
                    maxLength={200}
                    className="w-full bg-transparent rounded-full pl-5 pr-14 py-3 text-[14px] focus:outline-none text-white placeholder:text-white/45"
                  />
                  {inputValue.length > 160 && (
                    <span className={cn(
                      "absolute right-11 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums pointer-events-none",
                      inputValue.length >= 200 ? "text-rose-400" : "text-amber-300/80"
                    )}>
                      {200 - inputValue.length}
                    </span>
                  )}
                  <Smile className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/45 pointer-events-none" />
                </div>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={handleSend}
                  disabled={!inputValue.trim()}
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed relative overflow-hidden transition-transform",
                    inputValue.trim() && "animate-[giftSendBreathe_2.4s_ease-in-out_infinite]"
                  )}
                  style={{
                    background: "linear-gradient(135deg, #ec4899, #a855f7, #7c3aed)",
                  }}
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
                  {inputValue.trim() && (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-[giftSendShine_2.4s_ease-in-out_infinite]"
                      style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)" }}
                    />
                  )}
                  <Send className="w-5 h-5 text-white relative z-10 -ml-0.5" />
                </motion.button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChametStyleChatPanel;
