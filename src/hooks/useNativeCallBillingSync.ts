/**
 * Pkg500 Phase D — Native PrivateCallActivity ↔ JS billing sync.
 *
 * The native call surface (Android only) cannot subscribe to Supabase
 * Realtime directly without dragging the Supabase Kotlin SDK into the
 * APK. Instead, JS is the single billing source-of-truth and pushes
 * `(balance, ratePerMinute)` snapshots into the Activity through the
 * NativeCall plugin every time:
 *
 *   - `private_calls` row updates (server cron `bill_call_minute`
 *      writes `last_billed_minute`, `total_minutes_billed`).
 *   - The caller's wallet `profiles.coins` changes (recharge, gift, etc).
 *   - The call's `viewer_rate_per_min` is changed mid-call.
 *
 * Activity then runs a 1Hz local countdown so the low-balance banner
 * never freezes between server billing intervals (60s gap is normal),
 * and re-anchors to the freshest server number every time we push.
 *
 * Web / iOS / older APKs: every native call here is wrapped in
 * `tryNative*` and returns silently — this hook is additive only.
 *
 * Recharge CTA: when the caller taps "Recharge" inside the Activity,
 * the plugin emits a `recharge-requested` event; we route them to
 * `/recharge`. The call Activity stays running in its own task
 * (`taskAffinity=":privatecall"`) so the user can return to it after
 * topping up.
 */

import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { NativeCall } from '@/plugins/NativeCall';

interface UseNativeCallBillingSyncArgs {
  /** Current logged-in user id (caller side only — host side is skipped). */
  userId: string | null;
  /** Active call id; null/empty disables the sync. */
  callId: string | null | undefined;
}

function isAndroidNative(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function pushBilling(callId: string, balance: number, ratePerMinute: number) {
  if (!isAndroidNative()) return;
  if (!callId || balance < 0 || ratePerMinute <= 0) return;
  try {
    await NativeCall.updateInCallBilling({
      callId,
      balance: Math.floor(balance),
      ratePerMinute: Math.floor(ratePerMinute),
    });
  } catch {
    /* no-op — old APKs lack the method */
  }
}

export function useNativeCallBillingSync({
  userId,
  callId,
}: UseNativeCallBillingSyncArgs): void {
  const lastPushedRef = useRef<{ balance: number; rate: number } | null>(null);

  // 1) Recharge button listener — runs once per platform mount.
  useEffect(() => {
    if (!isAndroidNative()) return;
    let handle: { remove?: () => void } | null = null;
    (async () => {
      try {
        handle = await NativeCall.addListener('recharge-requested', (e) => {
          // Lazy import to avoid pulling router into this hook's deps.
          try {
            window.location.assign('/recharge');
          } catch {
            /* no-op */
          }
          // eslint-disable-next-line no-console
          console.log('[Pkg500/D] in-call recharge-requested', e);
        });
      } catch {
        /* no-op */
      }
    })();
    return () => {
      try { handle?.remove?.(); } catch { /* no-op */ }
    };
  }, []);

  // 2) Billing sync — caller side only (verified by reading caller_id).
  useEffect(() => {
    if (!isAndroidNative()) return;
    if (!userId || !callId) return;

    let cancelled = false;
    let balance = 0;
    let rate = 0;

    const maybePush = () => {
      if (cancelled) return;
      const last = lastPushedRef.current;
      if (last && last.balance === balance && last.rate === rate) return;
      lastPushedRef.current = { balance, rate };
      void pushBilling(callId, balance, rate);
    };

    // Initial fetch — verify caller side, then read wallet balance + per-minute rate.
    (async () => {
      try {
        const { data: callRow } = await supabase
          .from('private_calls')
          .select('caller_id, viewer_rate_per_min, coins_per_minute')
          .eq('id', callId)
          .maybeSingle();
        if (cancelled) return;
        if (!callRow || callRow.caller_id !== userId) {
          // host side or row missing — nothing to push
          cancelled = true;
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('coins')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        balance = Number(profile?.coins ?? 0);
        rate = Number(
          callRow.viewer_rate_per_min ?? (callRow as { coins_per_minute?: number }).coins_per_minute ?? 0,
        );
        maybePush();
      } catch {
        /* no-op */
      }
    })();

    // Realtime — caller wallet (push every balance change).
    const profileChannel = supabase
      .channel(`native-call-billing-profile-${userId}-${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        (payload) => {
          const next = Number((payload.new as { coins?: number } | null)?.coins ?? balance);
          if (Number.isFinite(next)) {
            balance = next;
            maybePush();
          }
        },
      )
      .subscribe();

    // Realtime — call row (rate can change mid-call; minute-tick implies fresh balance push opportunity).
    const callChannel = supabase
      .channel(`native-call-billing-row-${callId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'private_calls', filter: `id=eq.${callId}` },
        (payload) => {
          const row = payload.new as {
            viewer_rate_per_min?: number;
            coins_per_minute?: number;
          } | null;
          const nextRate = Number(row?.viewer_rate_per_min ?? row?.coins_per_minute ?? rate);
          if (Number.isFinite(nextRate) && nextRate > 0 && nextRate !== rate) {
            rate = nextRate;
          }
          maybePush();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      lastPushedRef.current = null;
      try { supabase.removeChannel(profileChannel); } catch { /* no-op */ }
      try { supabase.removeChannel(callChannel); } catch { /* no-op */ }
    };
  }, [userId, callId]);
}
