/**
 * Pkg212 — Offline DM outbox.
 *
 * Persistent FIFO queue of outgoing direct messages that failed to send
 * (no network, server 5xx, etc). Survives reloads and app kills via
 * localStorage. On reconnect (online event / Realtime resub / app
 * resume) the registered drainer drains the queue.
 *
 * Per-conversation ordering is preserved (FIFO insertion order).
 */

const KEY = 'mli.dm.outbox.v1';
const MAX = 200;

export interface OutboxItem {
  id: string;              // local uuid, also used as optimistic message id
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  replyToId?: string;      // reply_to_id for quoting messages
  createdAt: number;       // ms epoch
  attempts: number;
  lastError?: string;
}

type Listener = (items: OutboxItem[]) => void;
const listeners = new Set<Listener>();

function readAll(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function writeAll(items: OutboxItem[]) {
  try { localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX))); } catch {}
  listeners.forEach(l => { try { l(items); } catch {} });
}

export const messageOutbox = {
  list(): OutboxItem[] { return readAll(); },

  listFor(conversationId: string, senderId?: string): OutboxItem[] {
    return readAll().filter(i =>
      i.conversationId === conversationId &&
      (!senderId || i.senderId === senderId)
    );
  },

  enqueue(item: Omit<OutboxItem, 'attempts' | 'createdAt'> & { createdAt?: number }): OutboxItem {
    const all = readAll();
    const next: OutboxItem = {
      attempts: 0,
      createdAt: item.createdAt ?? Date.now(),
      ...item,
    };
    all.push(next);
    writeAll(all);
    return next;
  },

  remove(id: string) {
    writeAll(readAll().filter(i => i.id !== id));
  },

  bumpAttempt(id: string, error?: string) {
    const all = readAll();
    const idx = all.findIndex(i => i.id === id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], attempts: all[idx].attempts + 1, lastError: error };
      writeAll(all);
    }
  },

  clear() { writeAll([]); },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    try { fn(readAll()); } catch {}
    return () => { listeners.delete(fn); };
  },
};
