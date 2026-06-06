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

    (async () => {
      if (!isNativeGiftAnimFlagOn()) return;
      const ok = await isNativeGiftAnimationAvailable();
      if (cancelled || !ok) return;
      enabledRef.current = true;

      // Window event bridge
      const onWindow = (ev: Event) => {
        const detail = (ev as CustomEvent<DispatchDetail>).detail;
        if (!detail?.giftId) return;
        void dispatchOne(detail);
      };
      window.addEventListener('merilive:native-gift-dispatch', onWindow as EventListener);
      removeWindow = () =>
        window.removeEventListener('merilive:native-gift-dispatch', onWindow as EventListener);

      // Realtime bridge
      channel = supabase
        .channel('native-gift-dispatcher')
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
      if (channel) { try { supabase.removeChannel(channel); } catch { /* ignore */ } }
      if (removeWindow) removeWindow();
    };
  }, []);
}
