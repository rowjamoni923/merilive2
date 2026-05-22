import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  MessageCircle, 
  Gamepad2, 
  Gift, 
  X,
  Mic,
  MicOff,
  Eye,
  EyeOff,
  Heart,
  Volume2,
  VolumeX,
  MoreVertical,
  Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PartyRoomBottomBarProps {
  roomType: 'video' | 'audio' | 'game';
  isMuted: boolean;
  isVideoOff: boolean;
  isSpeakerOn: boolean;
  message: string;
  onMessageChange: (value: string) => void;
  onSendMessage: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onToggleSpeaker: () => void;
  onSendHeart: () => void;
  onOpenGiftPanel: () => void;
  onOpenSettings: () => void;
  onOpenGames: () => void;
  onClose: () => void;
}

const PartyRoomBottomBar = ({
  roomType,
  isMuted,
  isVideoOff,
  isSpeakerOn,
  message,
  onMessageChange,
  onSendMessage,
  onToggleAudio,
  onToggleVideo,
  onToggleSpeaker,
  onSendHeart,
  onOpenGiftPanel,
  onOpenSettings,
  onOpenGames,
  onClose
}: PartyRoomBottomBarProps) => {
  const [showMessageInput, setShowMessageInput] = useState(false);

  return (
    <div className="relative z-10 safe-area-bottom">
      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none" />
      
      {/* Message Input Row */}
      <AnimatePresence>
        {showMessageInput && (
          <motion.div 
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", damping: 26, stiffness: 360 }}
            className="relative px-4 pb-2"
          >
            <div
              className="flex items-center gap-2 rounded-full pl-4 pr-1.5 py-1.5 transition-all duration-200 focus-within:[box-shadow:0_0_0_2px_rgba(168,85,247,0.55),0_0_18px_rgba(168,85,247,0.35)]"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                border: "1px solid rgba(255,255,255,0.18)",
              }}
            >
              <Input
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-transparent border-0 text-white placeholder:text-white/55 focus-visible:ring-0 p-0 h-auto text-sm"
                onKeyDown={(e) => e.key === 'Enter' && onSendMessage()}
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                disabled={!message.trim()}
                className={cn(
                  "w-9 h-9 rounded-full text-white relative overflow-hidden disabled:opacity-40",
                  message.trim()
                    ? "bg-gradient-to-br from-pink-500 via-fuchsia-500 to-purple-600 hover:opacity-90 animate-[giftSendBreathe_2.4s_ease-in-out_infinite]"
                    : "hover:bg-white/20"
                )}
                onClick={onSendMessage}
              >
                {message.trim() && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-[giftSendShine_2.4s_ease-in-out_infinite]"
                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent)" }}
                  />
                )}
                <Send className="w-4 h-4 relative z-10" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Main Bottom Bar - Professional Style */}
      <div className="relative flex items-center justify-between px-4 py-3">
        {/* Left - Chat Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowMessageInput(!showMessageInput)}
          className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg",
            showMessageInput 
              ? "bg-gradient-to-r from-blue-500 to-cyan-500" 
              : "bg-white/15 backdrop-blur-md border border-white/20"
          )}
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </motion.button>

        {/* Center Controls - Only Gift Button */}
        <div className="flex items-center gap-3">
          {/* Gift Button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onOpenGiftPanel}
            className="w-14 h-14 rounded-full bg-gradient-to-r from-pink-500 to-red-500 flex items-center justify-center shadow-xl shadow-pink-500/30"
          >
            <Gift className="w-6 h-6 text-white" />
          </motion.button>
        </div>

        {/* Right - Only Three-Dots Menu */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center"
        >
          <MoreVertical className="w-5 h-5 text-white" />
        </motion.button>
      </div>
    </div>
  );
};

export default PartyRoomBottomBar;
