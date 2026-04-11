import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { clearFrameCache } from '@/components/common/AvatarWithFrame';

/**
 * Hook to check and restore expired VIP items
 * Automatically restores previous items when purchased items or VIP membership expire
 */
export const useExpiredItemsRestorer = (userId: string | null) => {
  useEffect(() => {
    if (!userId) return;

    const checkAndRestoreExpiredItems = async () => {
      try {
        // Fetch profile with all equipped and previous fields
        const { data: profile } = await supabase
          .from('profiles')
          .select(`
            vip_expires_at, current_vip_tier_id,
            equipped_frame_id, previous_frame_id,
            equipped_entrance_id, previous_entrance_id,
            equipped_bubble_id, previous_bubble_id,
            equipped_vehicle_id, previous_vehicle_id,
            equipped_medal_id, previous_medal_id,
            equipped_entry_name_bar_id, previous_entry_name_bar_id,
            equipped_entry_banner_id, previous_entry_banner_id,
            equipped_noble_card_id, previous_noble_card_id
          `)
          .eq('id', userId)
          .single();

        if (!profile) return;

        const updateData: Record<string, string | null> = {};
        let frameRestored = false;

        // ============================================
        // PART 1: Check VIP Subscription Expiration
        // ============================================
        if (profile.vip_expires_at && new Date(profile.vip_expires_at) < new Date()) {
          console.log('[ExpiredItemsRestorer] VIP membership expired, restoring previous items');
          
          const vipTierId = profile.current_vip_tier_id;
          
          if (vipTierId) {
            // If equipped_frame_id matches VIP tier, restore previous
            if (profile.equipped_frame_id === vipTierId && profile.previous_frame_id) {
              updateData.equipped_frame_id = profile.previous_frame_id;
              updateData.previous_frame_id = null;
              frameRestored = true;
              console.log('[ExpiredItemsRestorer] VIP frame expired, restoring:', profile.previous_frame_id);
            } else if (profile.equipped_frame_id === vipTierId) {
              updateData.equipped_frame_id = null;
            }

            // If equipped_entrance_id matches VIP tier, restore previous
            if (profile.equipped_entrance_id === vipTierId && profile.previous_entrance_id) {
              updateData.equipped_entrance_id = profile.previous_entrance_id;
              updateData.previous_entrance_id = null;
              console.log('[ExpiredItemsRestorer] VIP entrance expired, restoring:', profile.previous_entrance_id);
            } else if (profile.equipped_entrance_id === vipTierId) {
              updateData.equipped_entrance_id = null;
            }

            // If equipped_bubble_id matches VIP tier, restore previous
            if (profile.equipped_bubble_id === vipTierId && profile.previous_bubble_id) {
              updateData.equipped_bubble_id = profile.previous_bubble_id;
              updateData.previous_bubble_id = null;
            } else if (profile.equipped_bubble_id === vipTierId) {
              updateData.equipped_bubble_id = null;
            }

            // Clear VIP status
            updateData.current_vip_tier_id = null;
          }
        }

        // ============================================
        // PART 2: Check Shop Purchases Expiration
        // ============================================
        // NOTE: No FK between user_purchases and shop_items — use separate queries
        const { data: expiredPurchases, error: fetchError } = await supabase
          .from('user_purchases')
          .select('id, item_id, item_type, expires_at')
          .eq('user_id', userId)
          .eq('is_active', true)
          .not('expires_at', 'is', null)
          .lt('expires_at', new Date().toISOString());

        if (fetchError) {
          console.error('[ExpiredItemsRestorer] Error fetching expired items:', fetchError);
        }

        const expiredIds: string[] = [];

        if (expiredPurchases && expiredPurchases.length > 0) {
          console.log('[ExpiredItemsRestorer] Found expired purchases:', expiredPurchases.length);

          // Fetch categories from shop_items for the expired item IDs
          const itemIds = [...new Set(expiredPurchases.map(p => p.item_id).filter(Boolean))];
          let itemCategoryMap: Record<string, string> = {};
          
          if (itemIds.length > 0) {
            const { data: shopItems } = await supabase
              .from('shop_items')
              .select('id, category')
              .in('id', itemIds);
            
            if (shopItems) {
              itemCategoryMap = Object.fromEntries(shopItems.map(i => [i.id, i.category]));
            }
          }

          for (const purchase of expiredPurchases) {
            // Use item_type from purchase first, fallback to shop_items category
            const category = purchase.item_type || itemCategoryMap[purchase.item_id] || null;
            expiredIds.push(purchase.id);

            switch (category) {
              case 'frame':
              case 'portrait_frame':
                if (profile.equipped_frame_id === purchase.item_id) {
                  updateData.equipped_frame_id = profile.previous_frame_id || null;
                  updateData.previous_frame_id = null;
                  frameRestored = true;
                  console.log('[ExpiredItemsRestorer] Restoring previous frame:', profile.previous_frame_id);
                }
                break;

              case 'entrance':
              case 'entrance_effect':
                if (profile.equipped_entrance_id === purchase.item_id) {
                  updateData.equipped_entrance_id = profile.previous_entrance_id || null;
                  updateData.previous_entrance_id = null;
                  console.log('[ExpiredItemsRestorer] Restoring previous entrance:', profile.previous_entrance_id);
                }
                break;

              case 'entry_bar':
              case 'entry_name_bar':
                if (profile.equipped_entry_name_bar_id === purchase.item_id) {
                  updateData.equipped_entry_name_bar_id = profile.previous_entry_name_bar_id || null;
                  updateData.previous_entry_name_bar_id = null;
                }
                break;

              case 'bubble':
              case 'chat_bubble':
                if (profile.equipped_bubble_id === purchase.item_id) {
                  updateData.equipped_bubble_id = profile.previous_bubble_id || null;
                  updateData.previous_bubble_id = null;
                }
                break;

              case 'vehicle':
                if (profile.equipped_vehicle_id === purchase.item_id) {
                  updateData.equipped_vehicle_id = profile.previous_vehicle_id || null;
                  updateData.previous_vehicle_id = null;
                }
                break;

              case 'medal':
                if (profile.equipped_medal_id === purchase.item_id) {
                  updateData.equipped_medal_id = profile.previous_medal_id || null;
                  updateData.previous_medal_id = null;
                }
                break;

              case 'noble_card':
                if (profile.equipped_noble_card_id === purchase.item_id) {
                  updateData.equipped_noble_card_id = profile.previous_noble_card_id || null;
                  updateData.previous_noble_card_id = null;
                }
                break;

              case 'entry_banner':
                if (profile.equipped_entry_banner_id === purchase.item_id) {
                  updateData.equipped_entry_banner_id = profile.previous_entry_banner_id || null;
                  updateData.previous_entry_banner_id = null;
                }
                break;
            }
          }
        }

        // ============================================
        // PART 3: Apply all updates
        // ============================================
        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update(updateData)
            .eq('id', userId);

          if (updateError) {
            console.error('[ExpiredItemsRestorer] Error updating profile:', updateError);
          } else {
            console.log('[ExpiredItemsRestorer] Profile restored successfully:', updateData);
            
            if (frameRestored) {
              clearFrameCache();
            }
          }
        }

        // Mark expired purchases as inactive
        if (expiredIds.length > 0) {
          await supabase
            .from('user_purchases')
            .update({ is_active: false })
            .in('id', expiredIds);

          console.log('[ExpiredItemsRestorer] Marked expired purchases as unequipped:', expiredIds);
        }
      } catch (err) {
        console.error('[ExpiredItemsRestorer] Unexpected error:', err);
      }
    };

    // Run immediately on mount
    checkAndRestoreExpiredItems();

    // Also run periodically every minute
    const interval = setInterval(checkAndRestoreExpiredItems, 60000);

    return () => clearInterval(interval);
  }, [userId]);
};

export default useExpiredItemsRestorer;
