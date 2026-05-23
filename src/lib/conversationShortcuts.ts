/**
 * Pkg248 — Conversation shortcuts + Direct Share JS bridge.
 *
 * pushConversationShortcuts(items) replaces the dynamic shortcut set so
 * launcher long-press + system share sheet show top recent DMs.
 *
 * reportConversationUsage(id) should be called whenever the user opens a
 * chat — it tells Android to rank that person higher in Direct Share.
 */
import { registerPlugin, Capacitor } from '@capacitor/core';

export interface ConvShortcutItem {
  id: string;
  name: string;
  avatarBase64?: string; // raw base64 or data URL
  route?: string;
}

interface ConversationShortcutsPlugin {
  push(opts: { items: ConvShortcutItem[] }): Promise<{ count: number; max: number }>;
  reportUsage(opts: { id: string }): Promise<void>;
  clear(): Promise<void>;
}

const Native = registerPlugin<ConversationShortcutsPlugin>('ConversationShortcuts');
const isAndroid = () => Capacitor.getPlatform() === 'android';

export async function pushConversationShortcuts(items: ConvShortcutItem[]) {
  if (!isAndroid()) return { count: 0, max: 0 };
  const normalized = items.slice(0, 4).map((it) => ({
    ...it,
    route: it.route ?? `/chat?conversation=${encodeURIComponent(it.id)}`,
  }));
  try { return await Native.push({ items: normalized }); }
  catch { return { count: 0, max: 0 }; }
}

export async function reportConversationUsage(id: string) {
  if (!isAndroid()) return;
  try { await Native.reportUsage({ id }); } catch { /* no-op */ }
}

export async function clearConversationShortcuts() {
  if (!isAndroid()) return;
  try { await Native.clear(); } catch { /* no-op */ }
}

/**
 * Fetch a remote avatar and convert to base64 for the shortcut icon.
 * Keeps under 50KB; falls back to undefined on any error.
 */
export async function avatarUrlToBase64(url: string | null | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    if (blob.size > 200_000) return undefined; // skip huge avatars
    return await new Promise<string | undefined>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch { return undefined; }
}
