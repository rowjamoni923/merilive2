/**
 * Pkg202 — Disconnect-reason UX (M5).
 *
 * LiveKit emits `RoomEvent.Disconnected` with a `DisconnectReason` enum
 * value whenever a session ends. Today every disconnect looks the same to
 * the user — they can't tell if they were kicked, the host ended the
 * stream, their token expired, or another tab logged them in.
 *
 * This module:
 *  - Auto-attaches a `RoomEvent.Disconnected` listener on every Room
 *    registered through `registerStreamRoom` (Pkg121 registry), via the
 *    same dynamic-import hook used by Pkg201.
 *  - Maps the numeric `DisconnectReason` to a human-friendly `{ title,
 *    message, severity, isFinal }` descriptor.
 *  - Emits a `livekit-disconnect-reason` window event so any global
 *    listener (e.g. `DisconnectReasonToaster`) can surface a toast or
 *    a modal without prop-drilling.
 *  - Filters out the noisy `CLIENT_INITIATED` case so normal "user
 *    pressed back" disconnects stay silent.
 *
 * Pure listener — no Supabase, no polling, no behaviour change for
 * existing disconnect flows. $1400-rule safe.
 */

import { Room, RoomEvent } from 'livekit-client';
import { _getRegisteredRoom, type StreamScope } from './livekitStreams';

export type DisconnectScope = StreamScope;

// Mirror of livekit-client's DisconnectReason enum. Kept as a plain
// numeric map so we don't take a hard dep on the enum identifier (the
// protocol bundle mangles it in some builds).
export const DISCONNECT_REASON = {
  UNKNOWN_REASON: 0,
  CLIENT_INITIATED: 1,
  DUPLICATE_IDENTITY: 2,
  SERVER_SHUTDOWN: 3,
  PARTICIPANT_REMOVED: 4,
  ROOM_DELETED: 5,
  STATE_MISMATCH: 6,
  JOIN_FAILURE: 7,
  MIGRATION: 8,
  SIGNAL_CLOSE: 9,
  ROOM_CLOSED: 10,
  USER_UNAVAILABLE: 11,
  USER_REJECTED: 12,
  SIP_TRUNK_FAILURE: 13,
} as const;

export type DisconnectSeverity = 'info' | 'warning' | 'error';

export interface DisconnectDescriptor {
  reason: number | undefined;
  code: keyof typeof DISCONNECT_REASON | 'UNDEFINED';
  title: string;
  message: string;
  severity: DisconnectSeverity;
  /** True if user shouldn't expect auto-reconnect (kicked, room deleted, etc). */
  isFinal: boolean;
  /** True if this was a normal user-initiated leave — UI should stay silent. */
  silent: boolean;
}

export function describeDisconnectReason(reason: number | undefined): DisconnectDescriptor {
  switch (reason) {
    case DISCONNECT_REASON.CLIENT_INITIATED:
      return {
        reason,
        code: 'CLIENT_INITIATED',
        title: 'Disconnected',
        message: 'You left the room.',
        severity: 'info',
        isFinal: true,
        silent: true,
      };
    case DISCONNECT_REASON.DUPLICATE_IDENTITY:
      return {
        reason,
      };
    case DISCONNECT_REASON.SERVER_SHUTDOWN:
      return {
        reason,
      };
    case DISCONNECT_REASON.PARTICIPANT_REMOVED:
      return {
        reason,
      };
    case DISCONNECT_REASON.ROOM_DELETED:
    case DISCONNECT_REASON.ROOM_CLOSED:
      return {
        reason,
      };
    case DISCONNECT_REASON.STATE_MISMATCH:
      return {
        reason,
      };
    case DISCONNECT_REASON.JOIN_FAILURE:
      return {
        reason,
      };
    case DISCONNECT_REASON.MIGRATION:
      return {
        reason,
      };
    case DISCONNECT_REASON.SIGNAL_CLOSE:
      return {
        reason,
      };
    case DISCONNECT_REASON.USER_UNAVAILABLE:
      return {
        reason,
      };
    case DISCONNECT_REASON.USER_REJECTED:
      return {
        reason,
      };
    case DISCONNECT_REASON.SIP_TRUNK_FAILURE:
      return {
        reason,
      };
    case undefined:
      return {
        reason,
      };
    case DISCONNECT_REASON.UNKNOWN_REASON:
    default:
      return {
        reason,
      };
  }
}

// ─── Per-room watcher ─────────────────────────────────────────────────────

interface RunState {
  room: Room;
  handler: (reason?: number) => void;
}

const runs = new Map<string, RunState>();
const k = (scope: DisconnectScope, id: string) => `${scope}_${id}`;

export const DISCONNECT_REASON_EVENT = 'livekit-disconnect-reason';

export interface DisconnectReasonEventDetail extends DisconnectDescriptor {
  scope: DisconnectScope;
  id: string;
  /** ms-since-epoch when the event was emitted. */
  at: number;
}

function emit(scope: DisconnectScope, id: string, desc: DisconnectDescriptor) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DisconnectReasonEventDetail>(DISCONNECT_REASON_EVENT, {
      detail: { ...desc, scope, id, at: Date.now() },
    }),
  );
}

export function startDisconnectReasonWatcher(scope: DisconnectScope, id: string): boolean {
  const room = _getRegisteredRoom(scope, id);
  if (!room) return false;
  stopDisconnectReasonWatcher(scope, id);

  const handler = (reason?: number) => {
    const desc = describeDisconnectReason(reason);
    emit(scope, id, desc);
  };

  // livekit-client passes `reason` as the first arg.
  room.on(RoomEvent.Disconnected, handler as never);
  runs.set(k(scope, id), { room, handler });
  return true;
}

export function stopDisconnectReasonWatcher(scope: DisconnectScope, id: string) {
  const key = k(scope, id);
  const state = runs.get(key);
  if (!state) return;
  try {
    state.room.off(RoomEvent.Disconnected, state.handler as never);
  } catch {
    /* ignore */
  }
  runs.delete(key);
}
