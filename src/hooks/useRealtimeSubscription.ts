import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

interface SubscriptionConfig {
  table: string;
  schema?: string;
  event?: PostgresChangeEvent;
  filter?: string;
  onInsert?: (payload: any) => void;
  onUpdate?: (payload: any) => void;
  onDelete?: (payload: any) => void;
  onAny?: (payload: any) => void;
}

// ============= PUBLICATION GUARD =============
// CRITICAL: Only these tables are in supabase_realtime publication.
// Subscribing to other tables creates DB connections that do NOTHING
// and cause server overload. Non-publication tables use polling fallback.
const PUBLICATION_TABLES = new Set([
  'messages', 'conversations', 'live_streams', 'party_rooms',
  'notifications', 'profiles', 'gift_transactions', 'private_calls',
  'app_settings', 'agencies', 'agency_withdrawals', 'support_tickets',
  'support_messages'
]);

const isInPublication = (table: string) => PUBLICATION_TABLES.has(table);

/**
 * Hook for real-time Supabase subscriptions
 * OPTIMIZED: Only subscribes to tables in the realtime publication.
 * Non-publication tables are silently skipped (use polling instead).
 */
export const useRealtimeSubscription = (
  channelName: string,
  subscriptions: SubscriptionConfig[],
  enabled: boolean = true
) => {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled || subscriptions.length === 0) return;

    // Filter to only publication tables
    const validSubscriptions = subscriptions.filter(s => isInPublication(s.table));
    
    if (validSubscriptions.length === 0) {
      // No valid realtime tables — skip channel creation entirely
      return;
    }

    // Create channel
    let channel = supabase.channel(channelName);

    // Add each subscription (only publication tables)
    validSubscriptions.forEach((config) => {
      const { 
        table, 
        schema = 'public', 
        event = '*', 
        filter,
        onInsert,
        onUpdate,
        onDelete,
        onAny 
      } = config;

      const subscribeConfig: any = { event, schema, table };
      if (filter) subscribeConfig.filter = filter;

      channel = channel.on(
        'postgres_changes',
        subscribeConfig,
        (payload) => {
          if (payload.eventType === 'INSERT' && onInsert) onInsert(payload.new);
          else if (payload.eventType === 'UPDATE' && onUpdate) onUpdate(payload.new);
          else if (payload.eventType === 'DELETE' && onDelete) onDelete(payload.old);
          if (onAny) onAny(payload);
        }
      );
    });

    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [channelName, enabled, JSON.stringify(subscriptions.map(s => s.table + s.filter))]);

  return channelRef.current;
};

/**
 * Simple hook for subscribing to a single table
 * GUARDED: Only works for publication tables
 */
export const useTableSubscription = (
  table: string,
  userId: string | null,
  onUpdate: () => void,
  filterColumn: string = 'user_id'
) => {
  useEffect(() => {
    if (!userId || !isInPublication(table)) return;

    const channel = supabase
      .channel(`${table}-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `${filterColumn}=eq.${userId}` },
        () => onUpdate()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, userId, filterColumn]);
};

/**
 * Hook for subscribing to global table updates (no user filter)
 * GUARDED: Only works for publication tables
 */
export const useGlobalTableSubscription = (
  table: string,
  onUpdate: () => void,
  enabled: boolean = true
) => {
  useEffect(() => {
    if (!enabled || !isInPublication(table)) return;

    const channel = supabase
      .channel(`global-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => onUpdate()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table, enabled]);
};

/**
 * Hook for profile real-time updates including level changes
 */
export const useProfileRealtime = (
  userId: string | null,
  onProfileUpdate: (profile: any) => void
) => {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`profile-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        async (payload) => {
          console.log('[Realtime] Profile updated:', payload.new);
          onProfileUpdate(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Profile subscription:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
};

/**
 * Hook for agency real-time updates
 */
export const useAgencyRealtime = (
  agencyId: string | null,
  onAgencyUpdate: (agency: any) => void
) => {
  useEffect(() => {
    if (!agencyId) return;

    // Only subscribe to 'agencies' (in publication). 'agency_hosts' is NOT in publication.
    const channel = supabase
      .channel(`agency-realtime-${agencyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agencies', filter: `id=eq.${agencyId}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') {
            onAgencyUpdate(payload.new);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [agencyId]);
};

/**
 * Hook for wallet/balance real-time updates
 */
export const useWalletRealtime = (
  userId: string | null,
  onBalanceUpdate: (coins: number) => void
) => {
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`wallet-realtime-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${userId}`
        },
        (payload: any) => {
          if (payload.new?.coins !== undefined) {
            onBalanceUpdate(payload.new.coins);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gift_transactions',
          filter: `receiver_id=eq.${userId}`
        },
        async () => {
          // Refetch balance when receiving gifts
          const { data } = await supabase
            .from('profiles')
            .select('coins')
            .eq('id', userId)
            .single();
          if (data) {
            onBalanceUpdate(data.coins || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
};