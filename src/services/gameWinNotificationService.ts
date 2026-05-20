import { supabase } from "@/integrations/supabase/client";

/**
 * Sends a game win notification to the party room chat
 * This notification appears in the chat area for all room participants to see
 * Includes user name, level, and formatted win amount
 */
export const sendGameWinNotification = async ({
  roomId,
  userId,
  gameName,
  winAmount,
  gameEmoji = "🎰",
  userName,
  userLevel,
  context = 'party',
}: {
  roomId: string;
  userId: string;
  gameName: string;
  winAmount: number;
  gameEmoji?: string;
  userName?: string;
  userLevel?: number;
  /**
   * 'party' → inserts into party_room_messages (roomId = party_rooms.id)
   * 'live'  → inserts into stream_chat (roomId = live_streams.id)
   * 'none'  → no broadcast (e.g. private 1:1 chat, GoLive preview)
   */
  context?: 'party' | 'live' | 'none';
}) => {
  if (!roomId || !userId || winAmount <= 0) return;
  if (context === 'none') return;

  try {
    const formatAmount = (amount: number): string => {
      if (amount >= 1000000) {
        const m = amount / 1000000;
        return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
      }
      if (amount >= 1000) {
        const k = amount / 1000;
        return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}K`;
      }
      return amount.toLocaleString();
    };

    const formattedAmount = formatAmount(winAmount);

    // Resolve display name + level via public view (no cross-user profiles read)
    let displayName = userName || 'Player';
    let level = userLevel || 1;

    if (!userName || !userLevel) {
      const { data: profile } = await supabase
        .from('profiles_public')
        .select('display_name, user_level')
        .eq('id', userId)
        .maybeSingle();

      if (profile) {
        displayName = (profile as any).display_name || 'Player';
        level = (profile as any).user_level || 1;
      }
    }

    // Encoded win bubble — RoomChatOverlay parses and renders as gold message
    const winMessage = `[GAME_WIN:${gameEmoji}:${gameName}:${formattedAmount}:${displayName}:${level}]`;

    if (context === 'live') {
      await supabase.from('stream_chat').insert({
        stream_id: roomId,
        user_id: userId,
        message: winMessage,
        message_type: 'game_win',
      });
    } else {
      await supabase.from('party_room_messages').insert({
        room_id: roomId,
        sender_id: userId,
        content: winMessage,
        message_type: 'game_win',
      });
    }

    console.log(`[GameWin] (${context}) ${displayName} (Lv${level}) won ${formattedAmount} in ${gameName}`);
  } catch (error) {
    console.error('[GameWin] Failed to send win notification:', error);
  }
};

/**
 * Parse a game win message from the chat content
 */
export const parseGameWinMessage = (content: string): {
  isGameWin: boolean;
  emoji?: string;
  gameName?: string;
  amount?: string;
  userName?: string;
  userLevel?: number;
} => {
  // Try new format first: [GAME_WIN:emoji:gameName:amount:userName:level]
  const matchNew = content.match(/^\[GAME_WIN:(.+?):(.+?):(.+?):(.+?):(\d+)\]$/);
  if (matchNew) {
    return {
      isGameWin: true,
      emoji: matchNew[1],
      gameName: matchNew[2],
      amount: matchNew[3],
      userName: matchNew[4],
      userLevel: parseInt(matchNew[5])
    };
  }
  
  // Fallback to old format: [GAME_WIN:emoji:gameName:amount]
  const matchOld = content.match(/^\[GAME_WIN:(.+?):(.+?):(.+?)\]$/);
  if (matchOld) {
    return {
      isGameWin: true,
      emoji: matchOld[1],
      gameName: matchOld[2],
      amount: matchOld[3]
    };
  }
  
  return { isGameWin: false };
};
