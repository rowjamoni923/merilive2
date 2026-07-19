import { supabase } from "@/integrations/supabase/client";
import { getRequiredDisplayLevel } from "@/utils/stableLevel";

/**
 * Industry-standard (Chamet/Bigo/Poppo) win-broadcast guards.
 *
 *  - BIG_WIN_THRESHOLD: minimum net diamonds before a win is announced in chat.
 *    Filters out trivial wins so the chat panel doesn't get spammed by every
 *    1–50 diamond payout. Default 100 ≈ $3 USD (matches Chamet/Bigo Wishing
 *    Pool floor).
 *  - PER_USER_COOLDOWN_MS: same user can't fire another broadcast within
 *    45s (Bigo P0/P1/P2 anti-spam standard). Memory-only — process-local;
 *    server-side dedup is also in place via DB primary keys on chat rows.
 *  - MEGA_WIN_THRESHOLD: jackpot tier (later: global ticker + chime).
 */
export const BIG_WIN_THRESHOLD = 100;
export const MEGA_WIN_THRESHOLD = 10_000;
const PER_USER_COOLDOWN_MS = 45_000;

// Per-user last-broadcast timestamp (in-memory, resets on page reload — fine
// because chat-row dedup also happens via DB row idempotency).
const lastBroadcastAt = new Map<string, number>();

/**
 * Sends a game win notification to the room chat (party or live stream).
 * Honors industry-standard threshold + per-user cooldown so trivial wins
 * don't spam the chat panel.
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

  // ── Industry guard #1: threshold ──
  if (winAmount < BIG_WIN_THRESHOLD) {
    return; // silent skip — small wins shown only in player's own win popup
  }

  // ── Industry guard #2: per-user cooldown ──
  const now = Date.now();
  const last = lastBroadcastAt.get(userId) ?? 0;
  if (now - last < PER_USER_COOLDOWN_MS) {
    return; // same user spamming spins — drop the noise
  }
  lastBroadcastAt.set(userId, now);


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
    };
  }

  // v2: [GAME_WIN:emoji:gameName:amount:userName:level]
  const m2 = content.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+):([^:]+):(\d+)\]$/);
  if (m2) {
    return {
    };
  }

  // v1: [GAME_WIN:emoji:gameName:amount]
  const m1 = content.match(/^\[GAME_WIN:([^:]+):([^:]+):([^:]+)\]$/);
  if (m1) {
    return {
    };
  }

  return { isGameWin: false };
};
