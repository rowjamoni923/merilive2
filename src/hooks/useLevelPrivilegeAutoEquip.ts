import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { clearFrameCache } from '@/components/common/AvatarWithFrame';
import { clearEntryAnimationCache } from '@/utils/fetchEntryAnimation';
import { resolveLevelFromTiers } from '@/utils/levelResolver';
import { useAppSyncEvent } from '@/hooks/useAppSyncEvent';

const shouldShowLevelReward = (requiredLevel: number | null | undefined): boolean => {
  const level = requiredLevel ?? 1;
  return level >= 1;
};

const isFreeAsset = (asset: {
  is_premium?: boolean | null;
  price_diamonds?: number | null;
}) => {
  return !asset.is_premium && (asset.price_diamonds ?? 0) <= 0 && (asset.price_diamonds ?? 0) <= 0;
};

type Candidate = { id: string; level: number };

const pickHighest = (items: Candidate[]): Candidate | null => {
  if (items.length === 0) return null;
  return items.reduce((best, item) => {
    if (item.level !== best.level) return item.level > best.level ? item : best;
    return item.id > best.id ? item : best;
  });
};

const normalizePrivilegeSlot = (category: string | null | undefined) => {
  const value = (category || '').toLowerCase();
  if (value === 'frame' || value === 'portrait_frame') return 'frame';
  if (value === 'entrance' || value === 'entrance_effect' || value === 'entry_banner') return 'entrance';
  if (value === 'entry_name_bar' || value === 'entry_bar' || value === 'entry_bar_effect') return 'entry_name_bar';
  if (value === 'bubble' || value === 'chat_bubble') return 'bubble';
  if (value === 'vehicle' || value === 'vehicle_entrance') return 'vehicle';
  if (value === 'badge' || value === 'medal' || value === 'vip_medal') return 'medal';
  if (value === 'noble_card') return 'noble_card';
  return value || 'other';
};

const isActivePurchase = (purchase: any) => {
  return !purchase?.expires_at || new Date(purchase.expires_at).getTime() > Date.now();
};

// Per-user throttle so an autosync storm cannot hammer the DB. This hook was
// the #1 production write source (millions of repeated equipped_* profile
// updates). Boot/admin sync is daily; purchase-driven force sync is still
// throttled to a small window so duplicate app_sync rows / old clients cannot
// bypass the guard and hammer profiles again.
const MIN_INTERVAL_MS = 24 * 60 * 60_000;
const FORCE_MIN_INTERVAL_MS = 10 * 60_000;
const lastRunAt = new Map<string, number>();
const inFlight = new Map<string, Promise<void>>();

const getPersistedLastRun = (userId: string) => {
  try { return Number(localStorage.getItem(`meri_level_auto_equip_last_${userId}`) || 0); }
  catch { return 0; }
};

const setPersistedLastRun = (userId: string) => {
  try { localStorage.setItem(`meri_level_auto_equip_last_${userId}`, String(Date.now())); }
  catch { /* ignore */ }
};

export const useLevelPrivilegeAutoEquip = (userId: string | null) => {
  useAppSyncEvent(['user_purchases'], () => {
    window.dispatchEvent(new CustomEvent('level-privilege-sync'));
  }, Boolean(userId));

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const syncLevelRewards = async (opts: { force?: boolean } = {}) => {
      // Throttle: skip if we ran recently for this user.
      const now = Date.now();
      const last = Math.max(lastRunAt.get(userId) ?? 0, getPersistedLastRun(userId));
      const minInterval = opts.force ? FORCE_MIN_INTERVAL_MS : MIN_INTERVAL_MS;
      if (now - last < minInterval) return;
      // Coalesce concurrent invocations for the same user.
      const existing = inFlight.get(userId);
      if (existing) return existing;

      const run = (async () => {
        lastRunAt.set(userId, Date.now());
        try {
        const { data: profile } = await supabase
          .from('profiles') // guard-ok: owner-only auto-equip sync for authenticated current user
          .select(`
            id,
            is_host,
            gender,
            user_level,
            host_level,
            max_user_level,
            total_recharged,
            total_earnings,
            weekly_earnings,
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

        const resolvedLevel = await resolveLevelFromTiers({
          id: userId,
          gender: profile.gender,
          is_host: profile.is_host,
          user_level: profile.user_level,
          host_level: profile.host_level,
          max_user_level: profile.max_user_level,
          total_recharged: profile.total_recharged,
          total_earnings: profile.total_earnings,
          weekly_earnings: profile.weekly_earnings,
        });

        if (cancelled) return;

        const effectiveLevel = resolvedLevel.level;
        const targetType = resolvedLevel.levelType;

        const [purchasesRes, assignedFramesRes, framesRes, levelPrivilegesRes, entryNameBarsRes, entryBannersRes, vehicleEntrancesRes] = await Promise.all([
          // Deterministic order so equippedPurchaseBySlot never flips between runs (root cause of update loops).
          supabase.from('user_purchases').select('item_id, is_equipped, expires_at, purchased_at, shop_items(category)').eq('user_id', userId).eq('is_active', true).order('purchased_at', { ascending: false }),
          supabase.from('user_role_frames').select('frame_id').eq('user_id', userId),
          supabase
            .from('avatar_frames')
            .select('id, min_level, level_required, target_type, is_premium, price_diamonds, price_diamonds')
            .eq('is_active', true)
            .or(`target_type.is.null,target_type.eq.both,target_type.eq.${targetType}`),
          supabase
            .from('level_privileges')
            .select('id, unlock_level, level, privilege_type')
            .eq('is_active', true),
          supabase
            .from('entry_name_bars')
            .select('id, level_required, is_premium, price_diamonds, price_diamonds')
            .eq('is_active', true),
          supabase
            .from('entry_banners')
            .select('id, level_required, is_premium, price_diamonds, price_diamonds')
            .eq('is_active', true),
          supabase
            .from('vehicle_entrances' as any)
            .select('id, level_required, is_premium, price_diamonds, price_diamonds')
            .eq('is_active', true),
        ]);

        if (cancelled) return;

        const updateData: Record<string, string> = {};
        const equippedPurchaseBySlot = new Map<string, string>();
        for (const purchase of (purchasesRes.data || []) as any[]) {
          if (!purchase.is_equipped || !purchase.item_id || !isActivePurchase(purchase)) continue;
          const slot = normalizePrivilegeSlot((purchase.shop_items as any)?.category);
          if (!equippedPurchaseBySlot.has(slot)) equippedPurchaseBySlot.set(slot, purchase.item_id);
        }

        const preferEquippedPurchase = (slot: string, field: string, currentId?: string | null) => {
          const purchasedId = equippedPurchaseBySlot.get(slot);
          if (purchasedId && currentId !== purchasedId) updateData[field] = purchasedId;
          return purchasedId || currentId || updateData[field] || null;
        };

        const nextFrameId = preferEquippedPurchase('frame', 'equipped_frame_id', profile.equipped_frame_id);
        const nextEntranceId = preferEquippedPurchase('entrance', 'equipped_entrance_id', profile.equipped_entrance_id || profile.equipped_entry_banner_id);
        if (updateData.equipped_entrance_id && profile.equipped_entry_banner_id !== updateData.equipped_entrance_id) {
          updateData.equipped_entry_banner_id = updateData.equipped_entrance_id;
        }
        const nextNameBarId = preferEquippedPurchase('entry_name_bar', 'equipped_entry_name_bar_id', profile.equipped_entry_name_bar_id);
        const nextBubbleId = preferEquippedPurchase('bubble', 'equipped_bubble_id', profile.equipped_bubble_id);
        const nextVehicleId = preferEquippedPurchase('vehicle', 'equipped_vehicle_id', profile.equipped_vehicle_id);

        const frameCandidates = ((framesRes.data || []) as any[])
          .map((frame) => ({
            level: frame.min_level ?? frame.level_required ?? 1,
            free: isFreeAsset(frame),
          }))
          .filter((frame) => frame.free && frame.level <= effectiveLevel && shouldShowLevelReward(frame.level));

        const levelPrivileges = (levelPrivilegesRes.data || []) as any[];

        const entranceCandidates = [
          ...((entryBannersRes.data || []) as any[])
            .map((item) => ({ id: item.id, level: item.level_required ?? 1, free: isFreeAsset(item) }))
            .filter((item) => item.free && item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
          ...levelPrivileges
            .filter((item) => ['entrance', 'entrance_effect', 'entry_banner'].includes(item.privilege_type))
            .map((item) => ({ id: item.id, level: item.unlock_level ?? item.level ?? 1 }))
            .filter((item) => item.level <= effectiveLevel && shouldShowLevelReward(item.level)),
        ];

        const nameBarCandidates = [
          ...((entryNameBarsRes.data || []) as any[])
            .map((item) => ({ id: item.id, level: item.level_required ?? 1, free: !item.is_premium && (item.price_diamonds ?? 0) <= 0 && (item.price_diamonds ?? 0) <= 0 }))
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

        // Build sets of every level-tier candidate id (regardless of unlock status)
        // so we can detect whether the currently-equipped item came from the level
        // ladder. Manual purchases and admin-assigned frames are NEVER in these sets,
        // so they stay untouched.
        const allFrameLevelIds = new Set<string>(((framesRes.data || []) as any[]).map((f: any) => f.id));
        const allEntranceLevelIds = new Set<string>([
          ...((entryBannersRes.data || []) as any[]).map((i: any) => i.id),
          ...levelPrivileges
            .filter((i: any) => ['entrance', 'entrance_effect', 'entry_banner'].includes(i.privilege_type))
            .map((i: any) => i.id),
        ]);
        const allNameBarLevelIds = new Set<string>([
          ...((entryNameBarsRes.data || []) as any[]).map((i: any) => i.id),
          ...levelPrivileges
            .filter((i: any) => ['entry_bar', 'entry_name_bar', 'entry_bar_effect'].includes(i.privilege_type))
            .map((i: any) => i.id),
        ]);
        const allBubbleLevelIds = new Set<string>(
          levelPrivileges
            .filter((i: any) => ['bubble', 'chat_bubble'].includes(i.privilege_type))
            .map((i: any) => i.id),
        );
        const allVehicleLevelIds = new Set<string>([
          ...((vehicleEntrancesRes.data || []) as any[]).map((i: any) => i.id),
          ...levelPrivileges
            .filter((i: any) => i.privilege_type === 'vehicle_entrance')
            .map((i: any) => i.id),
        ]);

        const adminAssignedFrameIds = new Set<string>(
          ((assignedFramesRes.data || []) as any[]).map((f: any) => f.frame_id),
        );

        // Replace when: slot is empty, OR currently equipped item is a level-tier
        // item (so we can swap up to the new highest). Never override manual
        // purchases or admin-assigned frames.
        const canSwapLevel = (
          slot: string,
          currentId: string | null | undefined,
          levelIds: Set<string>,
        ) => {
          if (!currentId) return true;
          if (equippedPurchaseBySlot.has(slot)) return false;
          if (slot === 'frame' && adminAssignedFrameIds.has(currentId)) return false;
          return levelIds.has(currentId);
        };

        if (bestFrame && canSwapLevel('frame', nextFrameId, allFrameLevelIds) && profile.equipped_frame_id !== bestFrame.id) {
          updateData.equipped_frame_id = bestFrame.id;
        }
        if (bestEntrance && canSwapLevel('entrance', nextEntranceId, allEntranceLevelIds)) {
          if (profile.equipped_entrance_id !== bestEntrance.id) updateData.equipped_entrance_id = bestEntrance.id;
          if (profile.equipped_entry_banner_id !== bestEntrance.id) updateData.equipped_entry_banner_id = bestEntrance.id;
        }
        if (bestNameBar && canSwapLevel('entry_name_bar', nextNameBarId, allNameBarLevelIds) && profile.equipped_entry_name_bar_id !== bestNameBar.id) {
          updateData.equipped_entry_name_bar_id = bestNameBar.id;
        }
        if (bestBubble && canSwapLevel('bubble', nextBubbleId, allBubbleLevelIds) && profile.equipped_bubble_id !== bestBubble.id) {
          updateData.equipped_bubble_id = bestBubble.id;
        }
        if (bestVehicle && canSwapLevel('vehicle', nextVehicleId, allVehicleLevelIds) && profile.equipped_vehicle_id !== bestVehicle.id) {
          updateData.equipped_vehicle_id = bestVehicle.id;
        }

        if (Object.keys(updateData).length > 0) {
          const { error } = await supabase.from('profiles').update(updateData).eq('id', userId);
          if (!error) setPersistedLastRun(userId);
          if (!error && updateData.equipped_frame_id) {
            clearFrameCache();
          }
          if (!error && (updateData.equipped_entrance_id || updateData.equipped_entry_name_bar_id || updateData.equipped_vehicle_id)) {
            clearEntryAnimationCache();
          }
        } else {
          setPersistedLastRun(userId);
        }
        } catch (error) {
          console.error('[useLevelPrivilegeAutoEquip] sync failed:', error);
        } finally {
          inFlight.delete(userId);
        }
      })();
      inFlight.set(userId, run);
      return run;
    };

    void syncLevelRewards();

    // Debounce burst events so admin/realtime storms can't trigger N parallel runs.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => { void syncLevelRewards(); }, 3000);
    };

    const scheduleForceSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void syncLevelRewards({ force: true }); }, 10_000);
    };

    const onAdminUpdate = (event: Event) => {
      const table = (event as CustomEvent<{ table?: string }>).detail?.table;
      if (table && ['user_role_frames', 'avatar_frames', 'level_privileges', 'entry_name_bars', 'entry_banners', 'vehicle_entrances'].includes(table)) {
        scheduleSync();
      }
    };
    const onAppSync = () => scheduleForceSync();
    window.addEventListener('admin-table-update', onAdminUpdate as EventListener);
    window.addEventListener('level-privilege-sync', onAppSync as EventListener);

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('admin-table-update', onAdminUpdate as EventListener);
      window.removeEventListener('level-privilege-sync', onAppSync as EventListener);
    };
  }, [userId]);
};


export default useLevelPrivilegeAutoEquip;