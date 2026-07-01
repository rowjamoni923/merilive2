import { useState, useEffect, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface RoomWelcomeMessage {
  id: string;
  message_text: string;
}

interface RoomWelcomeBannerProps {
  roomType: 'live' | 'party_audio' | 'party_video' | 'party_game';
  className?: string;
  /**
   * How long the welcome message stays visible before it auto-vanishes.
   * User explicit (2026-07-01): welcome message must appear briefly and
   * then disappear so the chat stream stays clean. Default 7s matches
   * Chamet/BIGO room system notices.
   */
  autoHideMs?: number;
}

const roomWelcomeCache = {
  data: null as RoomWelcomeMessage[] | null,
  fetchedAt: 0,
};
const ROOM_WELCOME_CACHE_MS = 5 * 60_000;

export const RoomWelcomeBanner = memo(({
  roomType,
  className,
  autoHideMs = 7000,
}: RoomWelcomeBannerProps) => {
  const [welcomeMessage, setWelcomeMessage] = useState<RoomWelcomeMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    fetchWelcomeMessage();
  }, [roomType]);

  // Auto-vanish once the message is on screen.
  useEffect(() => {
    if (loading || !welcomeMessage) return;
    const t = setTimeout(() => setVisible(false), autoHideMs);
    return () => clearTimeout(t);
  }, [loading, welcomeMessage, autoHideMs]);

  const fetchWelcomeMessage = async () => {
    try {
      const now = Date.now();
      let data = roomWelcomeCache.data;
      let error: any = null;

      if (!data || now - roomWelcomeCache.fetchedAt > ROOM_WELCOME_CACHE_MS) {
        const result = await supabase
          .from('room_welcome_messages')
          .select('id, message_text, is_active, created_at')
          .eq('is_active', true)
          .order('created_at', { ascending: true })
          .limit(4);
        data = (result.data || []) as RoomWelcomeMessage[];
        error = result.error;
        if (!error) {
          roomWelcomeCache.data = data;
          roomWelcomeCache.fetchedAt = now;
        }
      }

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
  // compact fit-content bubble, muted translucent dark bg, small text,
  // rendered like a system chat message that blends into the chat column,
  // then fades out after `autoHideMs`.
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6, height: 0, marginTop: 0, marginBottom: 0 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
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
      )}
    </AnimatePresence>
  );
});

RoomWelcomeBanner.displayName = 'RoomWelcomeBanner';

export default RoomWelcomeBanner;

