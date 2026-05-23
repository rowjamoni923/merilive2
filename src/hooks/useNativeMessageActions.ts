/**
 * Pkg209 — wires native DM notification actions (inline reply + mark
 * as read) into the existing Supabase client.
 *
 * Lifecycle:
 *   • On mount: subscribe to `message-action` (live deliveries) and
 *     drain the cold-start SharedPreferences queue.
 *   • On every foreground resume: drain again so anything queued while
 *     the process was killed gets processed.
 *
 * Each action runs under the user's own session — no service-role key,
 * no JWT shipped to the receiver, RLS-safe.
 */
import { useEffect } from 'react';
import { App as CapApp } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import {
  NativeMessageReply,
  isNativeMessageReplyAvailable,
  type NativeMessageAction,
} from '@/plugins/NativeMessageReply';

async function processAction(action: NativeMessageAction): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // signed out — drop silently

    if (action.type === 'reply') {
      if (!action.conversationId || !action.body) return;
      const { data: newMsg, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: action.conversationId,
          sender_id: user.id,
          content: action.body,
          message_type: 'text',
        })
        .select()
        .single();
      if (error) {
        console.warn('[Pkg209] reply insert failed:', error.message);
        return;
      }
      try {
        await supabase
          .from('conversations')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', action.conversationId);
      } catch { /* non-fatal */ }
      // Surface to any open Chat screen so it can reconcile optimistic state.
      window.dispatchEvent(new CustomEvent('native-dm-replied', {
        detail: { conversationId: action.conversationId, message: newMsg },
      }));
      return;
    }

    if (action.type === 'mark_read') {
      if (!action.conversationId) return;
      const { error } = await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('conversation_id', action.conversationId)
        .eq('is_read', false)
        .neq('sender_id', user.id);
      if (error) console.warn('[Pkg209] mark_read failed:', error.message);
      window.dispatchEvent(new CustomEvent('native-dm-read', {
        detail: { conversationId: action.conversationId },
      }));
    }
  } catch (err) {
    console.warn('[Pkg209] processAction error:', (err as Error).message);
  }
}

async function drainOnce(): Promise<void> {
  try {
    const { actions } = await NativeMessageReply.drainPending();
    for (const a of actions) await processAction(a);
  } catch { /* silent */ }
}

/**
 * Mount once near the top of the React tree (App.tsx, after auth
 * provider). Idempotent — multiple mounts dedupe via Capacitor's
 * listener registry.
 */
export function useNativeMessageActions(): void {
  useEffect(() => {
    if (!isNativeMessageReplyAvailable()) return;
    let handle: { remove?: () => void } | null = null;

    // Live deliveries when the JS layer is attached.
    NativeMessageReply.addListener('message-action', (e) => {
      void processAction(e);
    }).then((h) => { handle = h; }).catch(() => {});

    // Drain queue at boot + every foreground resume.
    void drainOnce();
    const sub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void drainOnce();
    });

    return () => {
      try { handle?.remove?.(); } catch { /* ignore */ }
      sub.then((s) => s.remove()).catch(() => {});
    };
  }, []);
}
