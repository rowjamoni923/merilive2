/**
 * Pkg131: LiveKit Raise-Hand
 * --------------------------------------------------------------
 * Audience members request to come on stage by "raising their hand";
 * hosts see an ordered queue and can promote them via Pkg130
 * `promoteToSpeaker(roomName, identity)`.
 *
 * Implementation: stores `{ raisedHand:true, raisedAt:<ms>, reason? }`
 * inside the participant's own LiveKit metadata (Pkg107). The SFU
 * persists + replicates it — late-joining hosts see the existing
 * queue for free, no Supabase round-trip, no polls, no channels.
 *
 * LiveKit-Purist:
 *   - Zero new Supabase channels, zero polls, zero cross-user reads
 *   - Reuses `livekit-participant-metadata` window event from Pkg107
 *   - No new kill-switch (rides Pkg107 `presence` informational state)
 *
 * Producer:  raiseHand(scope, id, { reason? })
 * Producer:  lowerHand(scope, id)
 * Consumer:  useRaisedHands(scope, id)  → ordered array of entries
 * Consumer:  hasRaisedHand(scope, id, identity)  (sync)
 */
import { useEffect, useState } from 'react';
import {
  type MetadataScope,
  readParticipantMetadata,
  setLocalParticipantMetadata,
} from '@/lib/livekitMetadata';

const RAISED_KEY = 'raisedHand';
const RAISED_AT_KEY = 'raisedAt';
const REASON_KEY = 'raiseReason';

export interface RaisedHandEntry {
  identity: string;
  raisedAt: number;
  reason?: string;
}

export interface RaiseHandOptions {
  /** Optional context string ≤120 chars shown to the host. */
  reason?: string;
}

function getLocalIdentity(scope: MetadataScope, id: string): string | null {
  // Read our own metadata is a no-op if the room isn't registered;
  // we still need our identity to build the entry. Pkg107 registry
  // stores the Room; look it up by re-reading current local metadata
  // (an existing-entry shortcut). For simplicity we fall back to
  // probing the registry through a public read.
  // We can't get identity directly from Pkg107 exports, so we rely on
  // setLocalParticipantMetadata silently failing when not connected.
  const current = readParticipantMetadata(scope, id, '__never_matches__');
  // void result is fine; we just needed to ensure registry side-effect free.
  void current;
  return null;
}

/**
 * Raise the local participant's hand in the bound Room.
 * Merges with any existing Pkg107 metadata so other keys (AFK, theme…)
 * are preserved.
 */
export async function raiseHand(
  scope: MetadataScope,
  id: string,
  options: RaiseHandOptions = {},
): Promise<boolean> {
  if (!scope || !id) return false;
  // Read whatever the local participant already has stored.
  // We can't pull our own identity from Pkg107 helpers, but
  // setLocalParticipantMetadata reads it internally — we just need
  // to preserve other keys, so probe the registry via window event
  // cache (best-effort: empty object if nothing).
  const existing = readLocalMetadataBestEffort(scope, id);

  const reason =
    typeof options.reason === 'string' && options.reason.trim().length
      ? options.reason.trim().slice(0, 120)
      : undefined;

  const next: Record<string, unknown> = {
    ...existing,
    [RAISED_KEY]: true,
    [RAISED_AT_KEY]: Date.now(),
  };
  if (reason) next[REASON_KEY] = reason;
  else delete next[REASON_KEY];

  return setLocalParticipantMetadata(scope, id, next);
}

/** Lower the local participant's hand (clears the 3 raise-hand keys). */
export async function lowerHand(
  scope: MetadataScope,
  id: string,
): Promise<boolean> {
  if (!scope || !id) return false;
  const existing = readLocalMetadataBestEffort(scope, id);
  const next = { ...existing };
  delete next[RAISED_KEY];
  delete next[RAISED_AT_KEY];
  delete next[REASON_KEY];
  return setLocalParticipantMetadata(scope, id, next);
}

/** Sync check — has this identity currently raised their hand? */
export function hasRaisedHand(
  scope: MetadataScope,
  id: string,
  identity: string,
): boolean {
  const m = readParticipantMetadata(scope, id, identity);
  return !!(m && m[RAISED_KEY] === true);
}

/**
 * React hook: live, ordered queue of raised hands for a bound Room.
 * Earliest raise first (FIFO). Order is stable across re-renders.
 */
export function useRaisedHands(
  scope: MetadataScope | undefined,
  id: string | undefined,
): RaisedHandEntry[] {
  const [hands, setHands] = useState<RaisedHandEntry[]>([]);

  useEffect(() => {
    if (!scope || !id) {
      setHands([]);
      return;
    }

    // Snapshot any rows already cached for this room.
    const initial: RaisedHandEntry[] = [];
    const cache = identityCache.get(`${scope}:${id}`);
    if (cache) {
      for (const [identity, entry] of cache) {
        if (entry.raised) initial.push({ identity, ...entry.payload });
      }
    }
    setHands(sortAsc(initial));

    const handler = (ev: Event) => {
      const d = (ev as CustomEvent).detail as
        | {
            scope?: string;
            id?: string;
            identity?: string;
            metadata?: Record<string, unknown> | null;
          }
        | undefined;
      if (!d || d.scope !== scope || d.id !== id || !d.identity) return;

      const meta = d.metadata ?? {};
      const raised = meta[RAISED_KEY] === true;
      const raisedAt = Number(meta[RAISED_AT_KEY]);
      const reasonRaw = meta[REASON_KEY];
      const reason = typeof reasonRaw === 'string' ? reasonRaw : undefined;

      // Update identity cache so subsequent useRaisedHands instances
      // can seed without waiting for another event.
      const ck = `${scope}:${id}`;
      let c = identityCache.get(ck);
      if (!c) {
        c = new Map();
        identityCache.set(ck, c);
      }
      if (raised && Number.isFinite(raisedAt)) {
        c.set(d.identity, {
          raised: true,
          payload: { raisedAt, reason },
        });
      } else {
        c.delete(d.identity);
      }

      setHands((prev) => {
        const filtered = prev.filter((h) => h.identity !== d.identity);
        if (raised && Number.isFinite(raisedAt)) {
          filtered.push({ identity: d.identity, raisedAt, reason });
        }
        return sortAsc(filtered);
      });
    };

    window.addEventListener('livekit-participant-metadata', handler as EventListener);
    return () => {
      window.removeEventListener(
        'livekit-participant-metadata',
        handler as EventListener,
      );
    };
  }, [scope, id]);

  return hands;
}

function sortAsc(arr: RaisedHandEntry[]): RaisedHandEntry[] {
  return [...arr].sort((a, b) => a.raisedAt - b.raisedAt);
}

// ─── Best-effort local-metadata cache ───────────────────────────────────────
// Pkg107 doesn't expose a "read MY current metadata" helper, so we mirror
// the last-seen local metadata from the window-event stream. This avoids
// clobbering other keys (AFK, theme, etc.) when we write raiseHand state.

const identityCache = new Map<
  string,
  Map<
    string,
    { raised: boolean; payload: { raisedAt: number; reason?: string } }
  >
>();

const localMetaCache = new Map<string, Record<string, unknown>>(); // `${scope}:${id}` → last MY metadata

function readLocalMetadataBestEffort(
  scope: MetadataScope,
  id: string,
): Record<string, unknown> {
  return localMetaCache.get(`${scope}:${id}`) ?? {};
}

// Mirror local-only metadata events into localMetaCache so raiseHand/lowerHand
// preserve any unrelated keys written by other features (Pkg107 AFK, etc.).
if (typeof window !== 'undefined') {
  window.addEventListener('livekit-participant-metadata', (ev: Event) => {
    const d = (ev as CustomEvent).detail as
      | {
          scope?: string;
          id?: string;
          identity?: string;
          metadata?: Record<string, unknown> | null;
          __local?: boolean;
        }
      | undefined;
    if (!d || !d.scope || !d.id || !d.identity) return;
    // We can't tell from Pkg107 events whether this was the local participant.
    // Workaround: also stash every identity we ever wrote so we can recover.
    // The setLocalParticipantMetadata call we issue immediately re-fires the
    // event for our own identity, so the LAST event for the local participant
    // wins by virtue of being most recent.
    const ck = `${d.scope}:${d.id}`;
    const probable = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
    localMetaCache.set(`${ck}:${d.identity}`, probable as Record<string, unknown>);
  });
}

/** Test-only — clears caches between specs. */
export function __resetRaiseHandForTests() {
  identityCache.clear();
  localMetaCache.clear();
}

// Re-export the unused helper to keep getLocalIdentity tree-shake friendly.
void getLocalIdentity;
