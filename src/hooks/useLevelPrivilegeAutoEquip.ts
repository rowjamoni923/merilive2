import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { clearFrameCache } from '@/components/common/AvatarWithFrame';

const shouldShowLevelReward = (requiredLevel: number | null | undefined): boolean => {
  const level = requiredLevel ?? 1;
  return level === 1 || level >= 6;
};

const isFreeAsset = (asset: {
  is_premium?: boolean | null;
  price_diamonds?: number | null;
  price_coins?: number | null;
}) => {
  return !asset.is_premium && (asset.price_diamonds ?? 0) <= 0 && (asset.price_coins ?? 0) <= 0;
};

type Candidate = { id: string; level: number };

const pickHighest = (items: Candidate[]): Candidate | null => {
  if (items.length === 0) return null;
  return items.reduce((best, item) => (item.level > best.level ? item : best));
};

export const useLevelPrivilegeAutoEquip = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const syncLevelRewards = async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select(`
            id,
            is_host,
            user_level,
            host_level,
            current_vip_tier_id,
            equipped_frame_id,
            equipped_entrance_id,
            equipped_entry_banner_id,
            equipped_entry_name_bar_id,
            equipped_bubble_id,
            equipped_vehicle_id
          `)
          .eq('id', userId)
          .maybeSingle();

        if (!profile || cancelled) return;

        const effectiveLevel = profile.is_host
          ? Math.max(profile.host_level || 1, 1)
          : Math.max(profile.user_level || 1, 1);
        const targetType = profile.is_host ? 'host' : 'user';

        const [purchasesRes, assignedFramesRes, framesRes, levelPrivilegesRes, entryNameBarsRes, entryBannersRes, vehicleEntrancesRes] = await Promise.all([
          supabase.from('user_purchases').select('item_id').eq('user_id', userId).eq('is_active', true),
          supabase.from('user_role_frames').select('frame_id').eq('user_id', userId),
          supabase
            .from('avatar_frames')
            .select('id, min_level, level_required, target_type, is_premium, price_diamonds, price_coins')
            .eq('is_active', true)
            .or(`target_type.is.null,target_type.eq.both,target_type.eq.${targetType}`),
          supabase
            .from('level_privileges')
            .select('id, unlock_level, level, privilege_type')
            .eq('is_active', true),
          supabase
            .from('entry_name_bars')
            .select('id, min_level, is_premium, price_diamonds')
            .eq('is_active', true),
          supabase
            .from('entry_banners')
            .select('id, min_level, is_premium, price_diamonds, price_coins')
            .eq('is_active', true),
          supabase
            .from('vehicle_entrances' as any)
            .select('id, level_required, is_premium, price_diamonds, price_coins')
            .eq('is_active', true),
        ]);

        if (cancelled) return;

        const protectedIds = new Set<string>([
          ...((purchasesRes.data || []).map((item: any) => item.item_id).filter(Boolean) as string[]),
          ...((assignedFramesRes.data || []).map((item: any) => item.frame_id).filter(Boolean) as string[]),
          ...(profile.current_vip_tier_id ? [profile.current_vip_tier_id] : []),
        ]);

        const frameCandidates = ((framesRes.data || []) as any[])
          .map((frame) => ({
            id: frame.id,
            level: frame.min_level ?? frame.level_required ?? 1,
            free: isFreeAsset(frame),
          }))
          .filter((frame) => frame.free && frame.level <= effectiveLevel && shouldShowLevelReward(frame.level));

        const levelPrivileges = (levelPrivilegesRes.data || []) as any[];

        const entranceCandidates = [
          ...((entryBannersRes.data || []) as any[])
            .map((item) => ({ id: item.id, level: item.min_level ?? 1, free: isFreeAsset(item) }))
            .filter((item) => item.free && item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
          ...levelPrivileges
            .filter((item) => ['entrance', 'entrance_effect', 'entry_banner'].includes(item.privilege_type))
            .map((item) => ({ id: item.id, level: item.unlock_level ?? item.level ?? 1 })))
            .filter((item) => item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
        ];

        const nameBarCandidates = [
          ...((entryNameBarsRes.data || []) as any[])
            .map((item) => ({ id: item.id, level: item.min_level ?? 1, free: !item.is_premium && (item.price_diamonds ?? 0) <= 0 }))
            .filter((item) => item.free && item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
          ...levelPrivileges
            .filter((item) => ['entry_bar', 'entry_name_bar', 'entry_bar_effect'].includes(item.privilege_type))
            .map((item) => ({ id: item.id, level: item.unlock_level ?? item.level ?? 1 }))
            .filter((item) => item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
        ];

        const bubbleCandidates = levelPrivileges
          .filter((item) => ['bubble', 'chat_bubble'].includes(item.privilege_type))
          .map((item) => ({ id: item.id, level: item.unlock_level ?? item.level ?? 1 }))
          .filter((item) => item.level <= effectiveLevel && shouldShowLevelReward(item.level));

        const vehicleCandidates = [
          ...((vehicleEntrancesRes.data || []) as any[])
            .map((item) => ({ id: item.id, level: item.level_required ?? 1, free: isFreeAsset(item) }))
            .filter((item) => item.free && item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
          ...levelPrivileges
            .filter((item) => item.privilege_type === 'vehicle_entrance')
            .map((item) => ({ id: item.id, level: item.unlock_level ?? item.level ?? 1 }))
            .filter((item) => item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
        ];

        const bestFrame = pickHighest(frameCandidates.map(({ id, level }) => ({ id, level })));
        const bestEntrance = pickHighest(entranceCandidates.map(({ id, level }) => ({ id, level })));
        const bestNameBar = pickHighest(nameBarCandidates.map(({ id, level }) => ({ id, level })));
        const bestBubble = pickHighest(bubbleCandidates);
        const bestVehicle = pickHighest(vehicleCandidates.map(({ id, level }) => ({ id, level })));

        const levelOwnedIds = new Set<string>([
          ...frameCandidates.map((item) => item.id),
          ...entranceCandidates.map((item) => item.id),
          ...nameBarCandidates.map((item) => item.id),
          ...bubbleCandidates.map((item) => item.id),
          ...vehicleCandidates.map((item) => item.id),
        ]);

        const canOverride = (currentId: string | null | undefined) => {
          if (!currentId) return true;
          if (protectedIds.has(currentId)) return false;
          return levelOwnedIds.has(currentId);
        };

        const updateData: Record<string, string> = {};

        if (bestFrame && canOverride(profile.equipped_frame_id) && profile.equipped_frame_id !== bestFrame.id) {
          updateData.equipped_frame_id = bestFrame.id;
        }
        if (bestEntrance && canOverride(profile.equipped_entrance_id || profile.equipped_entry_banner_id)) {
          if (profile.equipped_entrance_id !== bestEntrance.id) updateData.equipped_entrance_id = bestEntrance.id;
          if (profile.equipped_entry_banner_id !== bestEntrance.id) updateData.equipped_entry_banner_id = bestEntrance.id;
        }
        if (bestNameBar && canOverride(profile.equipped_entry_name_bar_id) && profile.equipped_entry_name_bar_id !== bestNameBar.id) {
          updateData.equipped_entry_name_bar_id = bestNameBar.id;
        }
        if (bestBubble && canOverride(profile.equipped_bubble_id) && profile.equipped_bubble_id !== bestBubble.id) {
          updateData.equipped_bubble_id = bestBubble.id;
        }
        if (bestVehicle && canOverride(profile.equipped_vehicle_id) && profile.equipped_vehicle_id !== bestVehicle.id) {
          updateData.equipped_vehicle_id = bestVehicle.id;
        }

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
          if (!error && updateData.equipped_frame_id) {
            clearFrameCache();
          }
        }
      } catch (error) {
        console.error('[useLevelPrivilegeAutoEquip] sync failed:', error);
      }
    };

    void syncLevelRewards();

    const channel = supabase
      .channel(`level-auto-equip-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_purchases', filter: `user_id=eq.${userId}` }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_role_frames', filter: `user_id=eq.${userId}` }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'avatar_frames' }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'level_privileges' }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_name_bars' }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_banners' }, () => void syncLevelRewards())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_entrances' }, () => void syncLevelRewards())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userId]);
};

export default useLevelPrivilegeAutoEquip;