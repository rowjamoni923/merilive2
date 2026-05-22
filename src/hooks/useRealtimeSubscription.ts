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
// CRITICAL: Only these app-facing tables may use Supabase Realtime.
// Room/call/live/gift/chat fanout is LiveKit/FCM + REST snapshots only.
const PUBLICATION_TABLES = new Set([
  'admin_broadcast',
  'notifications',
  'user_active_sessions',
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
    // `profiles` is deliberately NOT in supabase_realtime publication.
    // Use useUserBalance/own-row sync, admin-broadcast, or REST refresh instead.
    return;
  }, [userId, onProfileUpdate]);
};

/**
 * Hook for agency real-time updates
 */
export const useAgencyRealtime = (
  agencyId: string | null,
  onAgencyUpdate: (agency: any) => void
) => {
  useEffect(() => {
    // `agencies` is deliberately NOT in supabase_realtime publication.
    // Agency/admin updates should flow through admin_broadcast or REST refresh.
    return;
  }, [agencyId, onAgencyUpdate]);
};

/**
 * Hook for wallet/balance real-time updates
 */
export const useWalletRealtime = (
  userId: string | null,
  onBalanceUpdate: (coins: number) => void
) => {
  useEffect(() => {
    // Legacy wallet realtime disabled: profiles/gift_transactions are not in
    // publication. Active wallet sync lives in useUserBalance + optimistic updates.
    return;
  }, [userId, onBalanceUpdate]);
};