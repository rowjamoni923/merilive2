import { useState, useEffect, memo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface RoomWelcomeMessage {
  id: string;
  message_text: string;
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
        .select('id, message_text, is_active, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(4);

      if (error) {
        console.error('Error fetching welcome message:', error);
      } else {
        const roomTypeOrder: RoomWelcomeBannerProps['roomType'][] = ['live', 'party_audio', 'party_video', 'party_game'];
        setWelcomeMessage((data?.[roomTypeOrder.indexOf(roomType)] ?? data?.[0] ?? null) as RoomWelcomeMessage | null);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !welcomeMessage) return null;

  // Professional system-notice style (Chamet/Bigo standard):
  // compact fit-content bubble, muted translucent dark bg, no animation,
  // rendered like a system chat message that blends into the chat column.
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={cn(
        "flex items-start gap-1.5 py-1 px-2.5 rounded-xl w-fit max-w-[92%]",
        "bg-black/35 backdrop-blur-sm border border-white/10",
        className
      )}
    >
      <span className="text-[10px] shrink-0 mt-px opacity-70">⚠️</span>
      <span className="text-[10px] text-white/60 font-normal leading-snug">
        {welcomeMessage.message_text}
      </span>
    </motion.div>
  );
});

RoomWelcomeBanner.displayName = 'RoomWelcomeBanner';

export default RoomWelcomeBanner;
