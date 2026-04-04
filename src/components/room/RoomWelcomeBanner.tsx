import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface RoomWelcomeMessage {
  id: string;
  room_type: string;
  title: string;
  message: string;
  icon_emoji: string;
  background_color: string;
  text_color: string;
}

interface RoomWelcomeBannerProps {
  roomType: 'live' | 'party_audio' | 'party_video' | 'party_game';
  className?: string;
}

export const RoomWelcomeBanner = memo(({ 
  roomType,
  className
}: RoomWelcomeBannerProps) => {
  const [welcomeMessage, setWelcomeMessage] = useState<RoomWelcomeMessage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWelcomeMessage();
  }, [roomType]);

  const fetchWelcomeMessage = async () => {
    try {
      const { data, error } = await supabase
        .from('room_welcome_messages')
        .select('*')
        .eq('room_type', roomType)
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          setWelcomeMessage(null);
        } else {
          console.error('Error fetching welcome message:', error);
        }
      } else {
        setWelcomeMessage(data as RoomWelcomeMessage);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !welcomeMessage) return null;

  // Ultra Premium Luxury Style - matching chat overlay
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-start gap-2 py-2 px-3.5 rounded-2xl w-full",
        "bg-gradient-to-r from-red-500/30 via-pink-500/25 to-purple-500/20",
        "backdrop-blur-md border border-pink-300/25",
        "shadow-[0_2px_15px_rgba(236,72,153,0.2),0_0_30px_rgba(236,72,153,0.08)]",
        "ring-1 ring-pink-400/15",
        className
      )}
    >
      {/* Emoji with glow effect */}
      <motion.span 
        className="text-sm shrink-0 mt-0.5 drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        ⚠️
      </motion.span>
      
      {/* Full text - Premium styling */}
      <span className="text-[10px] text-white/95 font-medium drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] leading-relaxed">
        {welcomeMessage.message}
      </span>
    </motion.div>
  );
});

RoomWelcomeBanner.displayName = 'RoomWelcomeBanner';

export default RoomWelcomeBanner;
