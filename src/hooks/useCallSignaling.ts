/**
 * useCallSignaling — Phase 3 Step 3
 *
 * Subscribes to per-call Realtime broadcast channel `call_signaling:<call_id>`
 * emitted by the `call-billing-tick` edge function. Surfaces:
 *   - lowBalance      — true when remaining minutes <= 2
 *   - severity        — "warning" (<=2 min) | "critical" (<=1 min) | null
 *   - remainingMinutes / remainingSeconds
 *   - forceEnded      — true when server force-terminated the call
 *   - forceEndReason  — string (e.g. "insufficient_balance")
 *
 * Industry pattern (Chamet/Bigo/Poppo): non-blocking banner + recharge CTA +
 * single haptic on first trigger. Billing continues during reconnect window.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type CallSignalSeverity = 'warning' | 'critical';

interface SignalPayload {
  action: 'low_balance' | 'force_end' | 'recharge_success';
  remaining_minutes?: number;
  remaining_seconds?: number;
  severity?: CallSignalSeverity;
  reason?: string;
  call_id?: string;
  ts?: number;
}

interface UseCallSignalingResult {
  lowBalance: boolean;
  severity: CallSignalSeverity | null;
  remainingMinutes: number | null;
  remainingSeconds: number | null;
  forceEnded: boolean;
  forceEndReason: string | null;
  reset: () => void;
}

export function useCallSignaling(callId: string | null | undefined): UseCallSignalingResult {
  const [lowBalance, setLowBalance] = useState(false);
  const [severity, setSeverity] = useState<CallSignalSeverity | null>(null);
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [forceEnded, setForceEnded] = useState(false);
  const [forceEndReason, setForceEndReason] = useState<string | null>(null);
  const hapticFiredRef = useRef(false);

  useEffect(() => {
    if (!callId) return;

    // Reset state when call changes
    setLowBalance(false);
    setSeverity(null);
    setRemainingMinutes(null);
    setRemainingSeconds(null);
    setForceEnded(false);
    setForceEndReason(null);
    hapticFiredRef.current = false;

    const channel = supabase
      .channel(`call_signaling:${callId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        const p = payload as SignalPayload | null;
        if (!p) return;
        if (p.call_id && p.call_id !== callId) return;

        if (p.action === 'low_balance') {
          setLowBalance(true);
          setSeverity(p.severity ?? 'warning');
          setRemainingMinutes(typeof p.remaining_minutes === 'number' ? p.remaining_minutes : null);
          setRemainingSeconds(typeof p.remaining_seconds === 'number' ? p.remaining_seconds : null);
          // Single haptic on first trigger (Chamet/Poppo pattern)
          if (!hapticFiredRef.current && typeof navigator !== 'undefined' && navigator.vibrate) {
            try { navigator.vibrate([100, 50, 100]); } catch { /* noop */ }
            hapticFiredRef.current = true;
          }
        } else if (p.action === 'force_end') {
          setForceEnded(true);
          setForceEndReason(p.reason ?? 'force_end');
        } else if (p.action === 'recharge_success') {
          setLowBalance(false);
          setSeverity(null);
          setRemainingMinutes(null);
          setRemainingSeconds(null);
          hapticFiredRef.current = false;
        }
      })
      .subscribe();

    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [callId]);

  return {
    lowBalance,
    severity,
    remainingMinutes,
    remainingSeconds,
    forceEnded,
    forceEndReason,
    reset: () => {
      setLowBalance(false);
      setSeverity(null);
      setRemainingMinutes(null);
      setRemainingSeconds(null);
      setForceEnded(false);
      setForceEndReason(null);
      hapticFiredRef.current = false;
    },
  };
}
