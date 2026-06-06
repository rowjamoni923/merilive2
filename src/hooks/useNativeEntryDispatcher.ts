/**
 * Pkg438 Phase B — JS dispatcher that mirrors room-entry events into
 * the NativeEntryAnimation plugin (Android only).
 *
 * Watches `stream_viewers` and `party_room_participants` INSERTs scoped
 * to the room the local user is currently in (URL-derived), looks up the
 * entering user's equipped entry banner / noble entrance, and enqueues
 * the native overlay.
 *
 * No-op when flag OFF or platform != Android. Existing WebView entry
 * components are untouched.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { isNativeEntryAnimFlagOn } from '@/utils/nativeEntryAnimFlag';
import {
  isNativeEntryAnimationAvailable,
  tryEnqueueNativeEntry,
} from '@/plugins/NativeEntryAnimation';
import { resolveEntryForUser } from '@/native/entryAssetCache';

interface DispatchDetail {
  userId: string;
  force?: boolean;
}

function readCurrentContext(pathname: string): { streamId?: string; roomId?: string } {
  const live = pathname.match(/^\/live\/([0-9a-fA-F-]{36})/);
  if (live) return { streamId: live[1] };
  const party = pathname.match(/^\/party\/([0-9a-fA-F-]{36})/);
  if (party) return { roomId: party[1] };
  return {};
}

// De-dupe rapid re-entries (e.g. flaky network reconnects) — 30s window.
const recentlyShown = new Map<string, number>();
function shouldShow(userId: string): boolean {
  const now = Date.now();
  const last = recentlyShown.get(userId) ?? 0;
  if (now - last < 30_000) return false;
  recentlyShown.set(userId, now);
  // GC
  if (recentlyShown.size > 200) {
    for (const [k, t] of recentlyShown) if (now - t > 120_000) recentlyShown.delete(k);
  }
  return true;
}

async function dispatchEntry(userId: string, force = false) {
  if (!userId) return;
  if (!force && !shouldShow(userId)) return;
  const asset = await resolveEntryForUser(userId);
  if (!asset) return;
  await tryEnqueueNativeEntry({
    type: asset.type,
    url: asset.url,
    soundUrl: asset.soundUrl,
    priority: asset.priority,
    anchor: 'top',
  });
}

export function useNativeEntryDispatcher(currentUserId: string | null) {
  const location = useLocation();
  const ctxRef = useRef<{ streamId?: string; roomId?: string }>({});

  useEffect(() => {
    ctxRef.current = readCurrentContext(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let removeWindow: (() => void) | null = null;

    (async () => {
      if (!isNativeEntryAnimFlagOn()) return;
      const ok = await isNativeEntryAnimationAvailable();
      if (cancelled || !ok) return;

      const onWindow = (ev: Event) => {
        const detail = (ev as CustomEvent<DispatchDetail>).detail;
        if (!detail?.userId) return;
        void dispatchEntry(detail.userId, !!detail.force);
      };
      window.addEventListener('merilive:native-entry-dispatch', onWindow as EventListener);
      removeWindow = () =>
        window.removeEventListener('merilive:native-entry-dispatch', onWindow as EventListener);

      channel = supabase
        .channel('native-entry-dispatcher')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'stream_viewers' },
          (payload) => {
            const row = payload.new as { viewer_id?: string; stream_id?: string };
            if (!row?.viewer_id) return;
            if (row.viewer_id === currentUserId) return; // skip self
            const ctx = ctxRef.current;
            if (!ctx.streamId || row.stream_id !== ctx.streamId) return;
            void dispatchEntry(row.viewer_id);
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'party_room_participants' },
          (payload) => {
            const row = payload.new as { user_id?: string; room_id?: string };
            if (!row?.user_id) return;
            if (row.user_id === currentUserId) return;
            const ctx = ctxRef.current;
            if (!ctx.roomId || row.room_id !== ctx.roomId) return;
            void dispatchEntry(row.user_id);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) { try { supabase.removeChannel(channel); } catch { /* ignore */ } }
      if (removeWindow) removeWindow();
    };
  }, [currentUserId]);
}
