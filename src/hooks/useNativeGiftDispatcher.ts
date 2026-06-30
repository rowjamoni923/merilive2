/**
 * Pkg438 Phase B — JS dispatcher that mirrors gift_transactions into
 * the NativeGiftAnimation plugin (Android only).
 *
 * - No-op when:
 *     - flag `nativeGiftAnim` is OFF, OR
 *     - not running on native Android, OR
 *     - the plugin reports unavailable.
 * - Does NOT modify any forbidden web component. The existing WebView
 *   gift path (FullScreenGiftAnimation / FlyingGiftAnimation / VAPPlayer)
 *   keeps running in parallel. Once verified in QA, the web path can be
 *   visually muted per-route via opacity — but that's Phase C, not here.
 *
 * Inputs feeding the dispatcher:
 *   1. Supabase Realtime INSERTs on `gift_transactions` scoped to the
 *      stream/room the user is currently viewing (URL-derived).
 *   2. `window 'merilive:native-gift-dispatch'` CustomEvent — escape hatch
 *      so any non-realtime code path (local optimistic send) can also
 *      trigger the native overlay without touching forbidden components.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isNativeGiftAnimFlagOn } from '@/utils/nativeGiftAnimFlag';
import {
  isNativeGiftAnimationAvailable,
  tryEnqueueNativeGift,
} from '@/plugins/NativeGiftAnimation';
import { resolveGiftAsset } from '@/native/giftAssetCache';
import { setNativeGiftPipelineActive } from '@/utils/nativeAnimRuntime';
import type { GiftSentDetail } from '@/lib/livekitGiftSignaling';

interface DispatchDetail {
  giftId: string;
  quantity?: number;
  senderId?: string;
  receiverId?: string;
  streamId?: string;
  roomId?: string;
  /** Optional: skip context match (always dispatch). */
  force?: boolean;
}

/** Extract current stream/room id from the URL. */
function readCurrentContext(pathname: string): { streamId?: string; roomId?: string } {
  const live = pathname.match(/^\/live\/([0-9a-fA-F-]{36})/);
  if (live) return { streamId: live[1] };
  const party = pathname.match(/^\/party\/([0-9a-fA-F-]{36})/);
  if (party) return { roomId: party[1] };
  return {};
}

async function dispatchOne(detail: DispatchDetail) {
  const asset = await resolveGiftAsset(detail.giftId);
  if (!asset) return;
  // Priority: high-coin gifts win; cap at +500.
  const priority = Math.min(500, Math.floor(asset.coins / 100));
  const qty = Math.max(1, Math.min(99, detail.quantity ?? 1));
  // Single enqueue per transaction — the native side multiplies internally
  // via repeat count if needed; we pass quantity-derived priority bump.
  await tryEnqueueNativeGift({
    type: asset.type,
    url: asset.url,
    soundUrl: asset.soundUrl,
    coins: asset.coins * qty,
    priority: priority + Math.min(100, qty),
  });
}

export function useNativeGiftDispatcher() {
  const location = useLocation();
  const ctxRef = useRef<{ streamId?: string; roomId?: string }>({});
  const enabledRef = useRef(false);

  // Track URL context without re-subscribing realtime.
  useEffect(() => {
    ctxRef.current = readCurrentContext(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let removeWindow: (() => void) | null = null;
    let removeLiveKit: (() => void) | null = null;
    // Per-tx dedup: livekit-gift-sent fires ~0ms, gift_transactions Realtime
    // fires 200-500ms later for the SAME gift. Track recently-dispatched giftId+senderId
    // for 3s to play exactly once.
    const recentlyDispatched = new Map<string, number>();
    const markDispatched = (key: string) => {
      const now = Date.now();
      const last = recentlyDispatched.get(key) ?? 0;
      if (now - last < 3000) return false;
      recentlyDispatched.set(key, now);
      if (recentlyDispatched.size > 256) {
        for (const [k, t] of recentlyDispatched) if (now - t > 10_000) recentlyDispatched.delete(k);
      }
      return true;
    };

    (async () => {
      if (!isNativeGiftAnimFlagOn()) return;
      const ok = await isNativeGiftAnimationAvailable();
      if (cancelled || !ok) return;
      enabledRef.current = true;
      setNativeGiftPipelineActive(true);

      // (1) Zero-latency LiveKit bridge — matches the optimistic <50ms web path.
      const onLiveKit = (ev: Event) => {
        const detail = (ev as CustomEvent<GiftSentDetail>).detail;
        if (!detail?.giftId) return;
        const ctx = ctxRef.current;
        const matches =
          (ctx.streamId && detail.id === ctx.streamId && detail.scope === 'live') ||
          (ctx.roomId && detail.id === ctx.roomId && detail.scope === 'party');
        if (!matches) return;
        const key = `${detail.giftId}:${detail.senderId || ''}:${detail.timestamp || ''}`;
        if (!markDispatched(key)) return;
        void dispatchOne({
          giftId: detail.giftId,
          quantity: detail.count ?? 1,
          senderId: detail.senderId,
          receiverId: detail.receiverId,
        });
      };
      window.addEventListener('livekit-gift-sent', onLiveKit as EventListener);
      removeLiveKit = () =>
        window.removeEventListener('livekit-gift-sent', onLiveKit as EventListener);

      // (2) Manual escape-hatch window event
      const onWindow = (ev: Event) => {
        const detail = (ev as CustomEvent<DispatchDetail>).detail;
        if (!detail?.giftId) return;
        const key = `${detail.giftId}:${detail.senderId || ''}:manual`;
        if (!markDispatched(key)) return;
        void dispatchOne(detail);
      };
      window.addEventListener('merilive:native-gift-dispatch', onWindow as EventListener);
      removeWindow = () =>
        window.removeEventListener('merilive:native-gift-dispatch', onWindow as EventListener);

      // (3) Realtime bridge — safety net for gifts that bypass LiveKit signaling.
      channel = supabase
        .channel(`native-gift-dispatcher-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'gift_transactions' },
          (payload) => {
            const row = payload.new as {
              gift_id?: string;
              quantity?: number;
              stream_id?: string | null;
              room_id?: string | null;
              sender_id?: string;
              receiver_id?: string;
            };
            if (!row?.gift_id) return;
            const ctx = ctxRef.current;
            const matches =
              (ctx.streamId && row.stream_id === ctx.streamId) ||
              (ctx.roomId && row.room_id === ctx.roomId);
            if (!matches) return;
            const key = `${row.gift_id}:${row.sender_id || ''}:rt`;
            if (!markDispatched(key)) return;
            void dispatchOne({
              giftId: row.gift_id,
              quantity: row.quantity ?? 1,
              senderId: row.sender_id,
              receiverId: row.receiver_id,
              streamId: row.stream_id ?? undefined,
              roomId: row.room_id ?? undefined,
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      enabledRef.current = false;
      setNativeGiftPipelineActive(false);
      if (channel) { try { supabase.removeChannel(channel); } catch { /* ignore */ } }
      if (removeWindow) removeWindow();
      if (removeLiveKit) removeLiveKit();
    };
  }, []);
}
