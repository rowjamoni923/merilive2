import { supabase } from "@/integrations/supabase/client";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

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

    // Resolve display name + level + avatar via public view (no cross-user profiles read)
    let displayName = userName || 'Player';
    let level = userLevel ?? 1;
    let avatarUrl = '';

    // Always fetch profile to get avatar (needed for AvatarWithFrame entry-style banner)
    const { data: profile } = await supabase
      .from('profiles_public')
      .select('display_name, user_level, host_level, max_user_level, gender, is_host, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      if (!userName) displayName = (profile as any).display_name || 'Player';
      if (!userLevel) level = getRequiredDisplayLevel(profile);
      avatarUrl = (profile as any).avatar_url || '';
    }

    // Sanitize fields so the colon-delimited payload stays parseable.
    const safe = (s: string) => String(s ?? '').replace(/[:|\[\]]/g, ' ').trim();
    // Encoded win bubble — RoomChatOverlay parses and renders the entry-style gold banner.
    // Format v3: [GAME_WIN:emoji:gameName:amount:userName:level:userId:avatarUrl]
    // (back-compat: older parsers handle v1/v2 with fewer fields.)
    const winMessage = `[GAME_WIN:${safe(gameEmoji)}:${safe(gameName)}:${safe(formattedAmount)}:${safe(displayName)}:${level}:${userId}:${avatarUrl}]`;

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
  userId?: string;
  avatarUrl?: string;
} => {
  // v3: [GAME_WIN:emoji:gameName:amount:userName:level:userId:avatarUrl]
  const m3 = content.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+):([^:]+):(\d+):([0-9a-fA-F-]+):([^\]]*)\]$/);
  if (m3) {
    return {
      isGameWin: true,
      emoji: m3[1],
      gameName: m3[2],
      amount: m3[3],
      userName: m3[4],
      userLevel: parseInt(m3[5]),
      userId: m3[6],
      avatarUrl: m3[7] || undefined,
    };
  }

  // v2: [GAME_WIN:emoji:gameName:amount:userName:level]
  const m2 = content.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+):([^:]+):(\d+)\]$/);
  if (m2) {
    return {
      isGameWin: true,
      emoji: m2[1],
      gameName: m2[2],
      amount: m2[3],
      userName: m2[4],
      userLevel: parseInt(m2[5]),
    };
  }

  // v1: [GAME_WIN:emoji:gameName:amount]
  const m1 = content.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+)\]$/);
  if (m1) {
    return {
      isGameWin: true,
      emoji: m1[1],
      gameName: m1[2],
      amount: m1[3],
    };
  }

  return { isGameWin: false };
};
