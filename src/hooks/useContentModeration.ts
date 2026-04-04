import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * =====================================================
 * UNIFIED CONTENT MODERATION HOOK
 * =====================================================
 * 
 * Uses AWS Comprehend to detect toxic content.
 * ONE HOOK = ALL CHAT SECTIONS MODERATED:
 * - Direct Messages (Chat Page)
 * - Party Rooms (Audio, Video, Game)
 * - Live Streams
 * - Private Calls
 * - Support Chat
 * 
 * Usage: const { checkToxicContent } = useContentModeration(userId);
 * Then call checkToxicContent(text, { contextType: 'party_room', roomId }) in background.
 * =====================================================
 */

interface ModerationContext {
  contextType: 'chat' | 'party_room' | 'live_stream' | 'call' | 'support';
  conversationId?: string;
  groupId?: string;
  roomId?: string;
  streamId?: string;
  callId?: string;
}

interface ModerationResult {
  toxic: boolean;
  severity?: 'low' | 'medium' | 'high';
  autoDeducted?: boolean;
  deductedAmount?: number;
  labels?: Array<{ Name: string; Score: number }>;
}

export function useContentModeration(userId: string | null | undefined) {
  const checkToxicContent = useCallback(async (
    text: string, 
    context: ModerationContext
  ): Promise<ModerationResult | null> => {
    if (!userId || !text.trim()) return null;

    try {
      const { data, error } = await supabase.functions.invoke('content-moderate', {
        body: {
          message: text,
          userId,
          conversationId: context.conversationId,
          groupId: context.groupId,
          roomId: context.roomId,
          streamId: context.streamId,
          callId: context.callId,
          contextType: context.contextType,
        }
      });

      if (error) {
        console.error('[ContentModerate] Error:', error);
        return null;
      }

      if (data?.toxic) {
        if (data.autoDeducted) {
          toast.error(`🚨 ${data.deductedAmount} Beans deducted!`, {
            description: `Toxic content detected (${data.labels?.map((l: any) => l.Name).join(', ')})`
          });
        } else if (data.severity === 'high') {
          toast.warning("⚠️ Content Warning", {
            description: "Your message contains inappropriate content. Repeated violations may result in penalties."
          });
        }
        return data as ModerationResult;
      }

      return data as ModerationResult;
    } catch (err) {
      console.error('[ContentModerate] Failed:', err);
      return null;
    }
  }, [userId]);

  return { checkToxicContent };
}
