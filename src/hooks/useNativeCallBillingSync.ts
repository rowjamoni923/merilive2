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
 *   - The caller's wallet `profiles.diamonds` changes (recharge, gift, etc).
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

  // 1b) Pkg500 Phase F — Post-call end-screen action listener.
  //
  // PrivateCallEndActivity (native) emits a single `call-end-action`
  // event for every button on the summary screen plus the in-call
  // Gift button. We route each action to the existing in-app sheet
  // without dragging additional UI into this hook (the call task is
  // separate from the WebView, so route changes here surface AFTER
  // the user dismisses the end screen — exactly the Chamet pattern).
  //
  //   gift / gift_inline → open the gift sheet for the peer (DM-style)
  //   recharge / wallet  → open the recharge / wallet page
  //   rate               → submit_call_rating RPC (RLS-enforced)
  //   go_live            → open Go-Live composer (host side)
  //   close              → no-op (Activity already finished)
  useEffect(() => {
    if (!isAndroidNative()) return;
    let handle: { remove?: () => void } | null = null;
    (async () => {
      try {
        handle = await NativeCall.addListener('call-end-action', async (e) => {
          // Broadcast for any mounted UI that wants to react in-place.
          try {
            window.dispatchEvent(new CustomEvent('private-call-end-action', { detail: e }));
          } catch { /* no-op */ }
          try {
            switch (e.action) {
              case 'rate':
                if (e.rating && e.rating >= 1 && e.rating <= 5 && e.callId) {
                  await supabase.rpc('submit_call_rating', {
                    _call_id: e.callId,
                    _rating: e.rating,
                  });
                }
                break;
              case 'gift':
              case 'gift_inline':
                if (e.peerId && e.callId) {
                  // Pkg500 Phase G — open the inline call gift sheet
                  // (GlobalCallGiftSheet listens for this) while the
                  // native PrivateCallActivity auto-shrinks into PIP.
                  // Older builds without the global host fall through
                  // to the legacy profile-nav path below.
                  let handled = false;
                  try {
                    window.dispatchEvent(
                      new CustomEvent('open-call-gift-sheet', {
                        detail: { peerId: e.peerId, callId: e.callId, source: e.action },
                      }),
                    );
                    handled = true;
                  } catch {
                    /* no-op */
                  }
                  if (!handled) {
                    window.location.assign(`/profile/${e.peerId}?gift=1`);
                  }
                }
                break;
              case 'recharge':
                window.location.assign('/recharge');
                break;
              case 'wallet':
                window.location.assign('/wallet');
                break;
              case 'go_live':
                window.location.assign('/go-live');
                break;
              case 'close':
              default:
                break;
            }
          } catch {
            /* no-op — route may not exist on every build */
          }
          // eslint-disable-next-line no-console
          console.log('[Pkg500/F] call-end-action', e);
        });
      } catch {
        /* no-op — older APKs lack this event */
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
    let profileChannel: ReturnType<typeof supabase.channel> | null = null;
    let callChannel: ReturnType<typeof supabase.channel> | null = null;

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
          .select('caller_id, viewer_rate_per_min, diamonds_per_minute')
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
          .select('diamonds')
          .eq('id', userId)
          .maybeSingle();
        if (cancelled) return;
        balance = Number(profile?.diamonds ?? 0);
        rate = Number(
          callRow.viewer_rate_per_min ?? (callRow as { diamonds_per_minute?: number }).diamonds_per_minute ?? 0,
        );
        maybePush();
        if (cancelled) return;

        // Realtime — caller wallet (push every balance change). Open channels
        // only after confirming this device is the caller side, so the host
        // never briefly subscribes to the caller-scoped billing row channel.
        profileChannel = supabase
          .channel(`native-call-billing-profile-${userId}-${callId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
            (payload) => {
              const next = Number((payload.new as { coins?: number } | null)?.diamonds ?? balance);
              if (Number.isFinite(next)) {
                balance = next;
                maybePush();
              }
            },
          )
          .subscribe();

        callChannel = supabase
          .channel(`native-call-billing-row-${callId}-${userId}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'private_calls', filter: `id=eq.${callId}` },
            (payload) => {
              const row = payload.new as {
                viewer_rate_per_min?: number;
                diamonds_per_minute?: number;
              } | null;
              const nextRate = Number(row?.viewer_rate_per_min ?? row?.diamonds_per_minute ?? rate);
              if (Number.isFinite(nextRate) && nextRate > 0 && nextRate !== rate) {
                rate = nextRate;
              }
              maybePush();
            },
          )
          .subscribe();
      } catch {
        /* no-op */
      }
    })();

    return () => {
      cancelled = true;
      lastPushedRef.current = null;
      try { if (profileChannel) supabase.removeChannel(profileChannel); } catch { /* no-op */ }
      try { if (callChannel) supabase.removeChannel(callChannel); } catch { /* no-op */ }
    };
  }, [userId, callId]);
}
