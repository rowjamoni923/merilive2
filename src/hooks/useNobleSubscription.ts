import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";

export interface ActiveNobleSubscription {
  subscription_id: string;
  noble_card_id: string;
  rank_code: string;
  rank_name: string;
  rank_order: number;
  expires_at: string;
  // Cosmetic
  badge_color: string | null;
  badge_url: string | null;
  crown_url: string | null;
  username_color: string | null;
  custom_avatar_frame_url: string | null;
  custom_chat_bubble_url: string | null;
  entrance_animation_url: string | null;
  profile_background_url: string | null;
  // Power perks
  anti_kick_protection: boolean;
  stealth_mode: boolean;
  hide_real_level: boolean;
  forbidden_words_bypass: boolean;
  top_position_in_lists: boolean;
  vip_only_lounge_access: boolean;
  priority_random_match: boolean;
  exclusive_emoji_pack: boolean;
  // Economy
  recharge_bonus_percent: number;
  daily_free_diamonds: number;
  monthly_free_diamonds: number;
  cashback_percent: number;
  free_name_changes_per_month: number;
  entry_effect_duration_seconds: number;
}

/**
 * Returns the user's currently-active Noble subscription with merged card details.
 * Returns null if no active subscription.
 */
export const useNobleSubscription = (userId?: string | null) => {
  const [data, setData] = useState<ActiveNobleSubscription | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!userId) {
      setData(null);
      return;
    }
    setLoading(true);
    try {
      const { data: rows, error } = await supabase
        .from("user_noble_subscriptions")
        .select(`
          id,
          noble_card_id,
          expires_at,
          is_active,
          noble_cards:noble_card_id (
            id, rank_code, rank_name, rank_order,
            badge_color, badge_url, crown_url, username_color,
            custom_avatar_frame_url, custom_chat_bubble_url,
            entrance_animation_url, profile_background_url,
            anti_kick_protection, stealth_mode, hide_real_level,
            forbidden_words_bypass, top_position_in_lists,
            vip_only_lounge_access, priority_random_match, exclusive_emoji_pack,
            recharge_bonus_percent, daily_free_diamonds, monthly_free_diamonds,
            cashback_percent, free_name_changes_per_month, entry_effect_duration_seconds
          )
        `)
        .eq("user_id", userId)
        .eq("is_active", true)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !rows?.noble_cards) {
        setData(null);
      } else {
        const card: any = rows.noble_cards;
        setData({
          subscription_id: rows.id,
          noble_card_id: card.id,
          rank_code: card.rank_code,
          rank_name: card.rank_name,
          rank_order: card.rank_order,
          expires_at: rows.expires_at,
          badge_color: card.badge_color,
          badge_url: card.badge_url,
          crown_url: card.crown_url,
          username_color: card.username_color,
          custom_avatar_frame_url: card.custom_avatar_frame_url,
          custom_chat_bubble_url: card.custom_chat_bubble_url,
          entrance_animation_url: card.entrance_animation_url,
          profile_background_url: card.profile_background_url,
          anti_kick_protection: !!card.anti_kick_protection,
          stealth_mode: !!card.stealth_mode,
          hide_real_level: !!card.hide_real_level,
          forbidden_words_bypass: !!card.forbidden_words_bypass,
          top_position_in_lists: !!card.top_position_in_lists,
          vip_only_lounge_access: !!card.vip_only_lounge_access,
          priority_random_match: !!card.priority_random_match,
          exclusive_emoji_pack: !!card.exclusive_emoji_pack,
          recharge_bonus_percent: Number(card.recharge_bonus_percent) || 0,
          daily_free_diamonds: Number(card.daily_free_diamonds) || 0,
          monthly_free_diamonds: Number(card.monthly_free_diamonds) || 0,
          cashback_percent: Number(card.cashback_percent) || 0,
          free_name_changes_per_month: Number(card.free_name_changes_per_month) || 0,
          entry_effect_duration_seconds: Number(card.entry_effect_duration_seconds) || 5,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Realtime: refetch when this user's subscription row changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`noble-sub-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_noble_subscriptions",
          filter: `user_id=eq.${userId}`,
        },
        () => fetch()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetch]);

  return { noble: data, loading, refetch: fetch };
};

export default useNobleSubscription;
