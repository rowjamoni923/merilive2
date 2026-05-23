import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  pushConversationShortcuts,
  avatarUrlToBase64,
  type ConvShortcutItem,
} from '@/lib/conversationShortcuts';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

/**
 * Pkg248 — Sync top 4 recent conversations to dynamic shortcuts.
 *
 * - Runs on mount + on app resume.
 * - Reads `conversations` table for current user, sorted by last_message_at.
 * - Resolves each `other_user`'s display_name + avatar_url via profiles.
 * - Throttled to 60s between syncs to avoid Supabase load.
 */
let lastSyncAt = 0;
const THROTTLE_MS = 60_000;

async function syncOnce() {
  if (Capacitor.getPlatform() !== 'android') return;
  if (Date.now() - lastSyncAt < THROTTLE_MS) return;
  lastSyncAt = Date.now();

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return;

  const { data: convs } = await supabase
    .from('conversations')
    .select('id,participant1_id,participant2_id,last_message_at')
    .or(`participant1_id.eq.${uid},participant2_id.eq.${uid}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(4);

  if (!convs || convs.length === 0) return;

  const otherIds = convs.map((c: any) => (c.participant1_id === uid ? c.participant2_id : c.participant1_id));
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id,display_name,avatar_url')
    .in('id', otherIds);

  const byId = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));

  const items: ConvShortcutItem[] = await Promise.all(
    convs.map(async (c: any) => {
      const otherId = c.participant1_id === uid ? c.participant2_id : c.participant1_id;
      const p = byId.get(otherId);
      const avatarBase64 = await avatarUrlToBase64(p?.avatar_url);
      return {
        id: c.id,
        name: p?.display_name || 'Chat',
        avatarBase64,
        route: `/chat?conversation=${encodeURIComponent(c.id)}`,
      };
    })
  );

  await pushConversationShortcuts(items);
}

export function useConversationShortcuts() {
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    // Initial sync after 5s so it doesn't fight cold-start
    const t = setTimeout(() => { syncOnce().catch(() => {}); }, 5000);
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) syncOnce().catch(() => {});
    });
    return () => {
      clearTimeout(t);
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, []);
}
