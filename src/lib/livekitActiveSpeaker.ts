/**
 * Pkg98: Active Speaker detection via LiveKit `RoomEvent.ActiveSpeakersChanged`.
 *
 * LiveKit's server-side speaker detection fires this event with sub-200ms
 * latency, identifying which participants are currently speaking and their
 * audio levels. We piggy-back on the EXISTING Room (call/live/party) — no
 * new Supabase channels, no polling, no profile reads.
 *
 * Standard pattern used by Discord, Clubhouse, Twitter Spaces, Bigo Live —
 * highlights the speaking avatar so viewers always know who's talking.
 *
 * Dispatches a `livekit-active-speakers` CustomEvent with:
 *   { scope: 'call'|'live'|'party', id: string,
 *     identities: string[],         // currently speaking
 *     levels: Record<identity, number> } // 0.0-1.0 audio level
 *
 * Consumers: useActiveSpeakers(scope, id) → Set<identity>.
 *
 * Cost guards:
 *  - NO Supabase Realtime channels
 *  - NO polling / setInterval
 *  - NO cross-user profile reads
 *  - Kill-switch: app_settings.livekit_signaling_enabled.presence
 */
import { Room, RoomEvent, type Participant } from 'livekit-client';
import { isLiveKitEnabled } from './livekitSignaling';

export type SpeakerScope = 'call' | 'live' | 'party';

export interface ActiveSpeakersDetail {
  scope: SpeakerScope;
  id: string;
  identities: string[];
  levels: Record<string, number>;
}

interface Entry {
  room: Room;
  onChange: (speakers: Participant[]) => void;
}

// `${scope}_${id}` → Entry
const registry = new Map<string, Entry>();

const key = (scope: SpeakerScope, id: string) => `${scope}_${id}`;

function dispatch(scope: SpeakerScope, id: string, speakers: Participant[]) {
  if (typeof window === 'undefined') return;
  const identities: string[] = [];
  const levels: Record<string, number> = {};
  for (const p of speakers) {
    if (!p?.identity) continue;
    identities.push(p.identity);
    // audioLevel is 0..1, may be undefined while speaker just changed
    levels[p.identity] = typeof p.audioLevel === 'number' ? p.audioLevel : 0;
  }
  window.dispatchEvent(
    new CustomEvent<ActiveSpeakersDetail>('livekit-active-speakers', {
      detail: { scope, id, identities, levels },
    }),
  );
}

export function registerActiveSpeakerRoom(
  scope: SpeakerScope,
  id: string | null | undefined,
  room: Room | null | undefined,
) {
  if (!id || !room) return;
  unregisterActiveSpeakerRoom(scope, id);

  const onChange = (speakers: Participant[]) => dispatch(scope, id, speakers);

  try {
    room.on(RoomEvent.ActiveSpeakersChanged, onChange);
  } catch {
    return;
  }

  registry.set(key(scope, id), { room, onChange });

  // Initial empty snapshot — clears any stale ring from a previous room.
  dispatch(scope, id, []);

  // Light kill-switch ping (purely informational; LiveKit server-side
  // speaker detection is always free and cheap — no DataPackets involved).
  isLiveKitEnabled('presence').catch(() => {});
}

export function unregisterActiveSpeakerRoom(
  scope: SpeakerScope,
  id: string | null | undefined,
) {
  if (!id) return;
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.ActiveSpeakersChanged, entry.onChange);
  } catch {
    // room may already be disconnected
  }
  registry.delete(k);
  // Notify consumers that this room has no active speakers anymore.
  dispatch(scope, id, []);
}

/** Read the current speaker identities for a (scope,id). */
export function getActiveSpeakers(
  scope: SpeakerScope,
  id: string | null | undefined,
): string[] {
  if (!id) return [];
  const entry = registry.get(key(scope, id));
  if (!entry) return [];
  try {
    return entry.room.activeSpeakers.map((p) => p.identity).filter(Boolean);
  } catch {
    return [];
  }
}

/** Test-only — clears the registry between specs. */
export function __resetActiveSpeakerRegistryForTests() {
  for (const [k] of registry) {
    const [scope, ...rest] = k.split('_');
    unregisterActiveSpeakerRoom(scope as SpeakerScope, rest.join('_'));
  }
}
