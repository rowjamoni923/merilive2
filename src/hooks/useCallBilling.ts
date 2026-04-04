import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { updateCachedBalance } from '@/hooks/useUserBalance';

interface BillingState {
  totalDeducted: number;
  hostEarned: number;
  callerRemaining: number;
  minutesCharged: number;
}

export function useCallBilling(
  callId: string | null,
  isConnected: boolean,
  coinsPerMinute: number,
  onInsufficientFunds: () => void
) {
  const { toast } = useToast();
  const billingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [billingState, setBillingState] = useState<BillingState>({
    totalDeducted: 0,
    hostEarned: 0,
    callerRemaining: 0,
    minutesCharged: 0,
  });

  // Deduct coins every minute
  const deductCoins = useCallback(async () => {
    if (!callId) return;

    try {
      const { data, error } = await supabase.rpc('deduct_call_coins_per_minute', {
        p_call_id: callId,
      });

      if (error) {
        console.error('Error deducting coins:', error);
        return;
      }

      const result = data as any;
      
      if (!result.success) {
        if (result.call_ended) {
          toast({
            title: "Insufficient Coins",
            description: "Call ended due to low balance",
            variant: "destructive",
          });
          onInsufficientFunds();
        }
        return;
      }

      setBillingState(prev => ({
        totalDeducted: prev.totalDeducted + (result.coins_deducted || 0),
        hostEarned: prev.hostEarned + (result.host_earned || 0),
        callerRemaining: result.caller_remaining || 0,
        minutesCharged: prev.minutesCharged + 1,
      }));

      // CRITICAL: Update global cached balance so Profile reflects instantly
      if (result.caller_remaining !== undefined) {
        updateCachedBalance(result.caller_remaining);
      }

      console.log('[Billing] Minute charged:', result);
    } catch (err) {
      console.error('Billing error:', err);
    }
  }, [callId, toast, onInsufficientFunds]);

  // Start billing timer when call is connected
  useEffect(() => {
    if (isConnected && callId) {
      console.log('[Billing] Starting billing timer for call:', callId);
      
      // Deduct immediately for first minute
      deductCoins();
      
      // Then deduct every 60 seconds
      billingTimerRef.current = setInterval(() => {
        deductCoins();
      }, 60000); // Every 60 seconds
    }

    return () => {
      if (billingTimerRef.current) {
        console.log('[Billing] Clearing billing timer');
        clearInterval(billingTimerRef.current);
        billingTimerRef.current = null;
      }
    };
  }, [isConnected, callId, deductCoins]);

  // Reset billing state when call ends
  useEffect(() => {
    if (!callId) {
      setBillingState({
        totalDeducted: 0,
        hostEarned: 0,
        callerRemaining: 0,
        minutesCharged: 0,
      });
    }
  }, [callId]);

  return {
    billingState,
    coinsPerMinute,
  };
}
