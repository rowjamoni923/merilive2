/**
 * Phase 7 — Instant Paint: localStorage snapshots for chat threads.
 *
 * Persists the last N messages per conversation so reopening a thread shows
 * the prior view in <16ms (synchronous read) while the live fetch reconciles
 * in the background. Cheap, idempotent, and safe to call on every render
 * that already mutates `messages` state.
 *
 * Storage shape: `chat:snap:<conversationId>` → JSON { v, ts, messages }
 * Cap: last MAX_PER_CONV messages, and at most MAX_CONVS conversations
 * (LRU pruned on write). Total worst-case footprint ~600 KB.
 */
const PREFIX = 'chat:snap:';
const INDEX_KEY = 'chat:snap:_idx';
const MAX_PER_CONV = 30;
const MAX_CONVS = 30;
const VERSION = 1;

type Stored = { v: number; ts: number; messages: any[] };

function safeLS(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readIndex(ls: Storage): string[] {
  try {
    const raw = ls.getItem(INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(ls: Storage, ids: string[]) {
  try { ls.setItem(INDEX_KEY, JSON.stringify(ids.slice(0, MAX_CONVS))); } catch {}
}

function touchIndex(ls: Storage, conversationId: string) {
  const idx = readIndex(ls).filter((id) => id !== conversationId);
  idx.unshift(conversationId);
  // Evict overflow
  while (idx.length > MAX_CONVS) {
    const evict = idx.pop();
    if (evict) {
      try { ls.removeItem(PREFIX + evict); } catch {}
    }
  }
  writeIndex(ls, idx);
}

export function loadChatSnapshot(conversationId: string): any[] | null {
  if (!conversationId) return null;
  const ls = safeLS();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PREFIX + conversationId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.messages)) return null;
    return parsed.messages;
  } catch {
    return null;
  }
}

export function saveChatSnapshot(conversationId: string, messages: any[]) {
  if (!conversationId || !Array.isArray(messages)) return;
  const ls = safeLS();
  if (!ls) return;
  try {
    // Keep only the most recent N — slice from end (already sorted ascending
    // in Chat.tsx).
    const slim = messages.slice(-MAX_PER_CONV).map((m) => {
      // Drop transient/optimistic-only fields to save space; keep what UI needs.
      const { _optimistic, _localOnly, ...rest } = m || {};
      return rest;
    });
    const payload: Stored = { v: VERSION, ts: Date.now(), messages: slim };
    ls.setItem(PREFIX + conversationId, JSON.stringify(payload));
    touchIndex(ls, conversationId);
  } catch {
    // Quota — best-effort prune oldest then bail silently.
    try {
      const idx = readIndex(ls);
      const evict = idx.pop();
      if (evict) ls.removeItem(PREFIX + evict);
      writeIndex(ls, idx);
    } catch {}
  }
}

export function clearChatSnapshot(conversationId: string) {
  const ls = safeLS();
  if (!ls) return;
  try { ls.removeItem(PREFIX + conversationId); } catch {}
  const idx = readIndex(ls).filter((id) => id !== conversationId);
  writeIndex(ls, idx);
}
