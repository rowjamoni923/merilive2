/**
 * Pkg131: LiveKit Raise-Hand (built on Pkg107 metadata)
 * --------------------------------------------------------------
 * Audience members "raise their hand" to request promotion to speaker;
 * hosts watch an ordered FIFO queue and can promote via Pkg130
 * `promoteToSpeaker(roomName, identity)`.
 *
 * State lives inside each participant's own LiveKit metadata
 * (`{ raisedHand:true, raisedAt:<ms>, raiseReason? }`). SFU persists
 * & replicates it — late-joining hosts see the existing queue for
 * free, no Supabase round-trip, no polls, no channels.
 *
 * LiveKit-Purist:
 *   - Zero new Supabase channels, zero polls, zero cross-user reads
 *   - Reuses `livekit-participant-metadata` window event from Pkg107
 *   - Merges into existing local metadata so AFK/theme keys survive
 *   - No new kill-switch (rides Pkg107 `presence` informational state)
 *
 * API:
 *   - raiseHand(scope, id, { reason? })  →  Promise<boolean>
 *   - lowerHand(scope, id)               →  Promise<boolean>
 *   - hasRaisedHand(scope, id, identity) →  boolean
 *   - useRaisedHands(scope, id)          →  RaisedHandEntry[] (FIFO)
 */
import { useEffect, useState } from 'react';
import {
  type MetadataScope,
  readLocalMetadata,
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

/** Raise the local participant's hand (merges; preserves other metadata keys). */
export async function raiseHand(
  scope: MetadataScope,
  id: string,
  options: RaiseHandOptions = {},
): Promise<boolean> {
  if (!scope || !id) return false;
  const existing = readLocalMetadata(scope, id);

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

/** Lower the local participant's hand — clears the 3 raise-hand keys only. */
export async function lowerHand(
  scope: MetadataScope,
  id: string,
): Promise<boolean> {
  if (!scope || !id) return false;
  const existing = readLocalMetadata(scope, id);
  const next = { ...existing };
  delete next[RAISED_KEY];
  delete next[RAISED_AT_KEY];
  delete next[REASON_KEY];
  return setLocalParticipantMetadata(scope, id, next);
}

/** Sync check — is this identity currently raised? */
export function hasRaisedHand(
  scope: MetadataScope,
  id: string,
  identity: string,
): boolean {
  const m = readParticipantMetadata(scope, id, identity);
  return !!(m && m[RAISED_KEY] === true);
}

// ─── React hook (FIFO queue) ────────────────────────────────────────────────

const queues = new Map<string, Map<string, RaisedHandEntry>>(); // `${scope}:${id}` → identity→entry

function qkey(scope: MetadataScope, id: string) {
  return `${scope}:${id}`;
}

function sortAsc(arr: RaisedHandEntry[]): RaisedHandEntry[] {
  return [...arr].sort((a, b) => a.raisedAt - b.raisedAt);
}

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

    // Seed from existing queue cache (instant for late-mount components).
    const cache = queues.get(qkey(scope, id));
    if (cache && cache.size) setHands(sortAsc([...cache.values()]));

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

      const ck = qkey(scope, id);
      let cmap = queues.get(ck);
      if (!cmap) {
        cmap = new Map();
        queues.set(ck, cmap);
      }
      if (raised && Number.isFinite(raisedAt)) {
        cmap.set(d.identity, { identity: d.identity, raisedAt, reason });
      } else {
        cmap.delete(d.identity);
      }
      setHands(sortAsc([...cmap.values()]));
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

/** Test-only — clears the queue cache between specs. */
export function __resetRaiseHandForTests() {
  queues.clear();
}
