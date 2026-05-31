import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useRef } from 'react';
import { subscribeToTables } from '@/hooks/useUniversalRealtime';

export interface ParcelTemplate {
  id: string;
  name: string;
  description: string | null;
  icon_url: string | null;
  parcel_type: string;
  unlock_condition: string;
  unlock_threshold: number;
  reward_type: string;
  reward_amount: number;
  reward_label: string | null;
  expiry_hours: number;
  unlock_wait_hours: number;
  target_segment: string;
  display_order: number;
  glow_color: string | null;
}

export interface UserParcel {
  id: string;
  user_id: string;
  template_id: string;
  status: 'locked' | 'unlocked' | 'opened' | 'expired';
  current_progress: number;
  required_progress: number;
  assigned_at: string;
  unlocks_at: string | null;
  expires_at: string | null;
  opened_at: string | null;
  actual_reward_type: string | null;
  actual_reward_amount: number | null;
  parcel_templates: ParcelTemplate;
}

export function useParcels(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Generate parcels for user on first load
  useEffect(() => {
    if (!userId) return;
    Promise.resolve(supabase.rpc('generate_user_parcels', { p_user_id: userId } as any)).catch(() => {});
  }, [userId]);

  const { data: parcels, isLoading } = useQuery({
    queryKey: ['user-parcels', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase as any)
        .from('user_parcels')
        .select('*, parcel_templates(*)')
        .eq('user_id', userId)
        .in('status', ['locked', 'unlocked'])
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as UserParcel[];
    },
    enabled: !!userId,
  });

  const claimMutation = useMutation({
    mutationFn: async (parcelId: string) => {
      const { data, error } = await (supabase as any).rpc('claim_parcel_reward', { p_parcel_id: parcelId });
      if (error) throw error;
      return data as { success: boolean; error?: string; reward_type?: string; reward_amount?: number; parcel_name?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-parcels'] });
    },
  });

  // Pkg360: INSTANT PARCEL SYNC
  // Listens to user_parcels table for assignments or progress updates.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeToTables(
      `parcels-sync-${userId}`,
      ['user_parcels'],
      (_table, _event, payload: any) => {
        if (payload?.user_id === userId) {
          queryClient.invalidateQueries({ queryKey: ['user-parcels', userId] });
        }
      }
    );
    return unsub;
  }, [userId, queryClient]);



  return {
    parcels: parcels || [],
    isLoading,
    claimParcel: claimMutation.mutateAsync,
    isClaiming: claimMutation.isPending,
  };
}
