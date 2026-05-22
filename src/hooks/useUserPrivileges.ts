import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface UserPrivilege {
  id: string;
  category: string;
  name: string;
  animation_url: string | null;
  animation_file_url: string | null;
  preview_url: string | null;
  is_equipped: boolean;
  expires_at: string | null;
  item_type: 'shop' | 'level';
}

export interface EquippedPrivileges {
  frame: UserPrivilege | null;
  entrance: UserPrivilege | null;
  vehicle: UserPrivilege | null;
  bubble: UserPrivilege | null;
  badge: UserPrivilege | null;
  party_background: UserPrivilege | null;
  seat_effect: UserPrivilege | null;
  gift_effect: UserPrivilege | null;
  profile_decoration: UserPrivilege | null;
  room_theme: UserPrivilege | null;
  emoji: UserPrivilege | null;
  entry_bar: UserPrivilege | null;
  portrait_frame: UserPrivilege | null;
  privilege_sticker: UserPrivilege | null;
  privilege_gift: UserPrivilege | null;
  entrance_effect: UserPrivilege | null;
}

/**
 * Hook to fetch and manage user's purchased and level-unlocked privileges
 * This hook provides all equipped items for display across the app
 */
export const useUserPrivileges = (userId: string | null) => {
  const [privileges, setPrivileges] = useState<UserPrivilege[]>([]);
  const [equippedPrivileges, setEquippedPrivileges] = useState<EquippedPrivileges>({
    frame: null,
    entrance: null,
    vehicle: null,
    bubble: null,
    badge: null,
    party_background: null,
    seat_effect: null,
    gift_effect: null,
    profile_decoration: null,
    room_theme: null,
    emoji: null,
    entry_bar: null,
    portrait_frame: null,
    privilege_sticker: null,
    privilege_gift: null,
    entrance_effect: null,
  });
  const [loading, setLoading] = useState(true);
  const [userLevel, setUserLevel] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    fetchPrivileges();
    const unsubscribe = subscribeToChanges();

    return () => {
      unsubscribe();
    };
  }, [userId]);

  const fetchPrivileges = async () => {
    if (!userId) return;

    try {
      // Fetch user level
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_level')
        .eq('id', userId)
        .single();

      const level = profile?.user_level || 0;
      setUserLevel(level);

      // Fetch purchased items from shop
      const { data: purchases } = await supabase
        .from('user_purchases')
        .select(`
          id,
          item_id,
          is_equipped,
          expires_at,
          is_active,
          shop_items (
            id,
            name,
            category,
            animation_url,
            animation_file_url,
            preview_url
          )
        `)
        .eq('user_id', userId)
        .eq('is_active', true);

      // Fetch level privileges that user has unlocked
      const { data: levelPrivileges } = await supabase
        .from('level_privileges')
        .select('*')
        .eq('is_active', true)
        .lte('unlock_level', level);

      const allPrivileges: UserPrivilege[] = [];

      // Add shop purchases
      if (purchases) {
        for (const purchase of purchases) {
          const item = purchase.shop_items as any;
          if (item) {
            allPrivileges.push({
              id: purchase.id,
              category: item.category,
              name: item.name,
              animation_url: item.animation_url,
              animation_file_url: item.animation_file_url,
              preview_url: item.preview_url,
              is_equipped: purchase.is_equipped || false,
              expires_at: purchase.expires_at,
              item_type: 'shop',
            });
          }
        }
      }

      // Add level privileges
      if (levelPrivileges) {
        for (const priv of levelPrivileges) {
          allPrivileges.push({
            id: priv.id,
            category: priv.privilege_type,
            name: priv.name,
            animation_url: priv.animation_url,
            animation_file_url: null,
            preview_url: priv.preview_url,
            is_equipped: true, // Level privileges are always "equipped"
            expires_at: null,
            item_type: 'level',
          });
        }
      }

      setPrivileges(allPrivileges);

      // Build equipped privileges map
      const equipped: EquippedPrivileges = {
        frame: null,
        entrance: null,
        vehicle: null,
        bubble: null,
        badge: null,
        party_background: null,
        seat_effect: null,
        gift_effect: null,
        profile_decoration: null,
        room_theme: null,
        emoji: null,
        entry_bar: null,
        portrait_frame: null,
        privilege_sticker: null,
        privilege_gift: null,
        entrance_effect: null,
      };

      for (const priv of allPrivileges) {
        if (priv.is_equipped || priv.item_type === 'level') {
          const key = priv.category as keyof EquippedPrivileges;
          if (key in equipped) {
            // Prioritize shop items over level privileges if both exist
            if (!equipped[key] || priv.item_type === 'shop') {
              equipped[key] = priv;
            }
          }
        }
      }

      setEquippedPrivileges(equipped);
    } catch (error) {
      console.error('Error fetching privileges:', error);
    } finally {
      setLoading(false);
    }
  };

  // Pkg83-ext: removed static `level-privileges-realtime` channel + per-user
  // postgres_changes on user_purchases (table not in supabase_realtime
  // publication). Admin level_privileges edits push via Pkg37 admin_broadcast;
  // own purchases refresh via invisible app_sync notifications + after mutations.
  const subscribeToChanges = () => {
    const onAdmin = (e: Event) => {
      const table = (e as CustomEvent<{ table?: string }>).detail?.table;
      if (table === 'level_privileges') fetchPrivileges();
    };
    const onAppSync = (e: Event) => {
      const topic = (e as CustomEvent<{ topic?: string }>).detail?.topic;
      if (topic === 'user_purchases') fetchPrivileges();
    };
    window.addEventListener('admin-table-update', onAdmin as EventListener);
    window.addEventListener('app-sync', onAppSync as EventListener);
    return () => {
      window.removeEventListener('admin-table-update', onAdmin as EventListener);
      window.removeEventListener('app-sync', onAppSync as EventListener);
    };
  };


  const equipPrivilege = async (privilegeId: string, category: string) => {
    if (!userId) return false;

    try {
      // Unequip all items in this category first
      const { error: unequipError } = await supabase
        .from('user_purchases')
        .update({ is_equipped: false })
        .eq('user_id', userId)
        .eq('is_active', true);

      if (unequipError) throw unequipError;

      // Equip the selected item
      const { error } = await supabase
        .from('user_purchases')
        .update({ is_equipped: true })
        .eq('id', privilegeId);

      if (error) throw error;

      await fetchPrivileges();
      return true;
    } catch (error) {
      console.error('Error equipping privilege:', error);
      return false;
    }
  };

  const unequipPrivilege = async (privilegeId: string) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('user_purchases')
        .update({ is_equipped: false })
        .eq('id', privilegeId);

      if (error) throw error;

      await fetchPrivileges();
      return true;
    } catch (error) {
      console.error('Error unequipping privilege:', error);
      return false;
    }
  };

  return {
    privileges,
    equippedPrivileges,
    loading,
    userLevel,
    equipPrivilege,
    unequipPrivilege,
    refetch: fetchPrivileges,
  };
};

/**
 * Get equipped privileges for a specific user (for viewing other users)
 */
export const getEquippedPrivilegesForUser = async (userId: string): Promise<EquippedPrivileges | null> => {
  if (!userId) return null;

  try {
    // Fetch user level
    const { data: profile } = await supabase
      .from('profiles_public')
      .select('user_level')
      .eq('id', userId)
      .single();

    const level = profile?.user_level || 0;

    // Fetch equipped purchases
    const { data: purchases } = await supabase
      .from('user_purchases')
      .select(`
        id,
        is_equipped,
        expires_at,
        shop_items (
          id,
          name,
          category,
          animation_url,
          animation_file_url,
          preview_url
        )
      `)
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('is_equipped', true);

    // Fetch level privileges
    const { data: levelPrivileges } = await supabase
      .from('level_privileges')
      .select('*')
      .eq('is_active', true)
      .lte('unlock_level', level);

    const equipped: EquippedPrivileges = {
      frame: null,
      entrance: null,
      vehicle: null,
      bubble: null,
      badge: null,
      party_background: null,
      seat_effect: null,
      gift_effect: null,
      profile_decoration: null,
      room_theme: null,
      emoji: null,
      entry_bar: null,
      portrait_frame: null,
      privilege_sticker: null,
      privilege_gift: null,
      entrance_effect: null,
    };

    // Add shop purchases
    if (purchases) {
      for (const purchase of purchases) {
        const item = purchase.shop_items as any;
        if (item) {
          const key = item.category as keyof EquippedPrivileges;
          if (key in equipped) {
            equipped[key] = {
              id: purchase.id,
              category: item.category,
              name: item.name,
              animation_url: item.animation_url,
              animation_file_url: item.animation_file_url,
              preview_url: item.preview_url,
              is_equipped: true,
              expires_at: purchase.expires_at,
              item_type: 'shop',
            };
          }
        }
      }
    }

    // Add level privileges (only if no shop item equipped)
    if (levelPrivileges) {
      for (const priv of levelPrivileges) {
        const key = priv.privilege_type as keyof EquippedPrivileges;
        if (key in equipped && !equipped[key]) {
          equipped[key] = {
            id: priv.id,
            category: priv.privilege_type,
            name: priv.name,
            animation_url: priv.animation_url,
            animation_file_url: null,
            preview_url: priv.preview_url,
            is_equipped: true,
            expires_at: null,
            item_type: 'level',
          };
        }
      }
    }

    return equipped;
  } catch (error) {
    console.error('Error fetching user privileges:', error);
    return null;
  }
};

export default useUserPrivileges;
