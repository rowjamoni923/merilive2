import { useState, useEffect, useRef } from 'react';
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
  const profileEquipRef = useRef<Record<string, string | null>>({});
  const equipInFlightRef = useRef<Set<string>>(new Set());

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
      const { data: profile } = await supabase
        .from('profiles')
        .select(`
          user_level,
          equipped_frame_id,
          equipped_entrance_id,
          equipped_entry_banner_id,
          equipped_entry_name_bar_id,
          equipped_bubble_id,
          equipped_vehicle_id,
          equipped_medal_id,
          equipped_noble_card_id
        `)
        .eq('id', userId)
        .single();

      const level = profile?.user_level || 0;
      setUserLevel(level);
      profileEquipRef.current = {
        equipped_frame_id: profile?.equipped_frame_id ?? null,
        equipped_entrance_id: profile?.equipped_entrance_id ?? null,
        equipped_entry_banner_id: profile?.equipped_entry_banner_id ?? null,
        equipped_entry_name_bar_id: profile?.equipped_entry_name_bar_id ?? null,
        equipped_bubble_id: profile?.equipped_bubble_id ?? null,
        equipped_vehicle_id: profile?.equipped_vehicle_id ?? null,
        equipped_medal_id: profile?.equipped_medal_id ?? null,
        equipped_noble_card_id: profile?.equipped_noble_card_id ?? null,
      };

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

      const { data: levelPrivileges } = await supabase
        .from('level_privileges')
        .select('*')
        .eq('is_active', true)
        .lte('unlock_level', level);

      const allPrivileges: UserPrivilege[] = [];

      if (purchases) {
        for (const purchase of purchases) {
          const item = purchase.shop_items as any;
          if (item) {
            const cat = item.category;
            let isEquipped = purchase.is_equipped || false;
            
            if (cat === 'frame') isEquipped = isEquipped || purchase.item_id === profile?.equipped_frame_id;
            else if (cat === 'entrance' || cat === 'entrance_effect' || cat === 'entry_banner') 
              isEquipped = isEquipped || purchase.item_id === profile?.equipped_entrance_id || purchase.item_id === profile?.equipped_entry_banner_id;
            else if (cat === 'entry_bar' || cat === 'entry_name_bar') isEquipped = isEquipped || purchase.item_id === profile?.equipped_entry_name_bar_id;
            else if (cat === 'bubble') isEquipped = isEquipped || purchase.item_id === profile?.equipped_bubble_id;
            else if (cat === 'vehicle') isEquipped = isEquipped || purchase.item_id === profile?.equipped_vehicle_id;
            else if (cat === 'medal') isEquipped = isEquipped || purchase.item_id === profile?.equipped_medal_id;
            else if (cat === 'noble_card') isEquipped = isEquipped || purchase.item_id === profile?.equipped_noble_card_id;

            allPrivileges.push({
              id: purchase.id,
              category: cat,
              name: item.name,
              animation_url: item.animation_url,
              animation_file_url: item.animation_file_url,
              preview_url: item.preview_url,
              is_equipped: isEquipped,
              expires_at: purchase.expires_at,
              item_type: 'shop',
            });
          }
        }
      }

      if (levelPrivileges) {
        for (const priv of levelPrivileges) {
          const cat = priv.privilege_type;
          let isEquipped = false;
          
          if (cat === 'frame' || cat === 'portrait_frame') isEquipped = priv.id === profile?.equipped_frame_id;
          else if (cat === 'entrance' || cat === 'entrance_effect' || cat === 'entry_banner') 
            isEquipped = priv.id === profile?.equipped_entrance_id || priv.id === profile?.equipped_entry_banner_id;
          else if (cat === 'entry_bar' || cat === 'entry_name_bar') isEquipped = priv.id === profile?.equipped_entry_name_bar_id;
          else if (cat === 'bubble') isEquipped = priv.id === profile?.equipped_bubble_id;
          else if (cat === 'vehicle') isEquipped = priv.id === profile?.equipped_vehicle_id;
          else if (cat === 'medal') isEquipped = priv.id === profile?.equipped_medal_id;
          else if (cat === 'noble_card') isEquipped = priv.id === profile?.equipped_noble_card_id;

          allPrivileges.push({
            id: priv.id,
            category: cat,
            name: priv.name,
            animation_url: priv.animation_url,
            animation_file_url: null,
            preview_url: priv.preview_url,
            is_equipped: isEquipped,
            expires_at: null,
            item_type: 'level',
          });
        }
      }

      setPrivileges(allPrivileges);

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
        if (priv.is_equipped) {
          const key = priv.category as keyof EquippedPrivileges;
          let targetKey = key;
          if (key === 'portrait_frame') targetKey = 'frame' as any;
          if (key === 'entrance_effect' || (key as string) === 'entry_banner') targetKey = 'entrance' as any;
          if (key === 'entry_bar') targetKey = 'entry_bar' as any;

          if (targetKey in equipped) {
            equipped[targetKey as keyof EquippedPrivileges] = priv;
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

  const equipPrivilege = async (itemId: string, category: string, source: 'shop' | 'level' = 'shop') => {
    if (!userId) return false;
    const requestKey = `${userId}:equip:${category}:${itemId}:${source}`;
    if (equipInFlightRef.current.has(requestKey)) return true;

    try {
      equipInFlightRef.current.add(requestKey);
      let slot = category;
      if (category === 'portrait_frame' || category === 'frame') slot = 'frame';
      if (category === 'entrance_effect' || (category as string) === 'entry_banner' || category === 'entrance') slot = 'entrance';
      if (category === 'entry_bar' || category === 'entry_name_bar') slot = 'entry_name_bar';

      const updateData: any = {};
      if (slot === 'frame') updateData.equipped_frame_id = itemId;
      else if (slot === 'entrance') {
        updateData.equipped_entrance_id = itemId;
        updateData.equipped_entry_banner_id = itemId;
      }
      else if (slot === 'entry_name_bar') updateData.equipped_entry_name_bar_id = itemId;
      else if (slot === 'bubble') updateData.equipped_bubble_id = itemId;
      else if (slot === 'vehicle') updateData.equipped_vehicle_id = itemId;
      else if (slot === 'medal') updateData.equipped_medal_id = itemId;
      else if (slot === 'noble_card') updateData.equipped_noble_card_id = itemId;

      const currentEquip = profileEquipRef.current;
      const changedUpdateData = Object.fromEntries(
        Object.entries(updateData).filter(([key, value]) => currentEquip[key] !== value)
      );

      if (Object.keys(changedUpdateData).length > 0) {
        await supabase.from('profiles').update(changedUpdateData).eq('id', userId);
        profileEquipRef.current = { ...profileEquipRef.current, ...changedUpdateData };
      }

      if (Object.keys(updateData).length > 0) {
        // Nothing else to do here. Profile updates are guarded above so the same
        // equipped item cannot be re-written on every render/mount.
      }

      if (source === 'shop') {
        const { data: allPurchases } = await supabase
          .from("user_purchases")
          .select("id, shop_items(category)")
          .eq("user_id", userId)
          .eq("is_active", true);

        const sameCategoryIds = allPurchases
          ?.filter(p => {
            const pCategory = (p.shop_items as any)?.category;
            let pSlot = pCategory;
            if (pCategory === 'portrait_frame' || pCategory === 'frame') pSlot = 'frame';
            if (pCategory === 'entrance_effect' || (pCategory as string) === 'entry_banner' || pCategory === 'entrance') pSlot = 'entrance';
            if (pCategory === 'entry_bar' || pCategory === 'entry_name_bar') pSlot = 'entry_name_bar';
            
            return pSlot === slot;
          })
          .map(p => p.id) || [];

        if (sameCategoryIds.length > 0) {
          await supabase
            .from("user_purchases")
            .update({ is_equipped: false })
            .in("id", sameCategoryIds);
        }

        await supabase.from('user_purchases').update({ is_equipped: true }).eq('id', itemId);
      }

      await fetchPrivileges();
      return true;
    } catch (error) {
      console.error('Error equipping privilege:', error);
      return false;
    } finally {
      equipInFlightRef.current.delete(requestKey);
    }
  };

  const unequipPrivilege = async (category: string) => {
    if (!userId) return false;

    try {
      let slot = category;
      if (category === 'portrait_frame' || category === 'frame') slot = 'frame';
      if (category === 'entrance_effect' || (category as string) === 'entry_banner' || category === 'entrance') slot = 'entrance';

      const updateData: any = {};
      if (slot === 'frame') updateData.equipped_frame_id = null;
      else if (slot === 'entrance') {
        updateData.equipped_entrance_id = null;
        updateData.equipped_entry_banner_id = null;
      }
      else if (slot === 'entry_name_bar') updateData.equipped_entry_name_bar_id = null;
      else if (slot === 'bubble') updateData.equipped_bubble_id = null;
      else if (slot === 'vehicle') updateData.equipped_vehicle_id = null;
      else if (slot === 'medal') updateData.equipped_medal_id = null;
      else if (slot === 'noble_card') updateData.equipped_noble_card_id = null;

      const currentEquip = profileEquipRef.current;
      const changedUpdateData = Object.fromEntries(
        Object.entries(updateData).filter(([key, value]) => currentEquip[key] !== value)
      );

      if (Object.keys(changedUpdateData).length > 0) {
        await supabase.from('profiles').update(changedUpdateData).eq('id', userId);
        profileEquipRef.current = { ...profileEquipRef.current, ...changedUpdateData };
      }
      await supabase.from('user_purchases').update({ is_equipped: false }).eq('user_id', userId);

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

export const getEquippedPrivilegesForUser = async (userId: string): Promise<EquippedPrivileges | null> => {
  if (!userId) return null;

  try {
    const { data: profile } = await supabase
      .from('profiles_public')
      .select('user_level')
      .eq('id', userId)
      .single();

    const level = profile?.user_level || 0;

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
