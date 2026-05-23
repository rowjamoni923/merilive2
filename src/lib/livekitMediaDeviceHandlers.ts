/**
 * Pkg196 — Media-device failure & active-device-change reactive handler.
 *
 * LiveKit emits two device-related Room events that we currently ignore:
 *   - RoomEvent.MediaDevicesError       (getUserMedia/getDisplayMedia rejected)
 *   - RoomEvent.ActiveDeviceChanged     (mic/cam/speaker actually in use changed)
 *
 * Without listeners, a Bluetooth disconnect / unplugged USB cam / revoked
 * permission silently freezes the stream. Bigo/Chamet always surface a toast
 * and try to recover. This module centralizes that behavior across all 4
 * Room sites (host, viewer, call, party, PK-opp) — pure registration, no
 * Supabase, no polling.
 *
 * Dispatches:
 *   - 'livekit-media-device-error'     { scope, id, kind, error, name, message }
 *   - 'livekit-active-device-changed'  { scope, id, kind, deviceId }
 *
 * Auto-recovery (opt-in via `autoRecover: true`):
 *   - On a `NotReadableError` / `OverconstrainedError` for audioinput/videoinput,
 *     enumerate alternatives and `room.switchActiveDevice(kind, nextId)` once.
 *   - On `NotAllowedError` (permission), no auto-retry — surface event only.
 */

import { Room, RoomEvent, type LocalParticipant } from 'livekit-client';

export type DeviceKind = 'audioinput' | 'videoinput' | 'audiooutput';
export type DeviceScope = 'call' | 'live' | 'party';

export interface DeviceErrorDetail {
  scope: DeviceScope;
  id: string;
  kind: DeviceKind | 'unknown';
  name: string;
  message: string;
  recovered: boolean;
}

export interface ActiveDeviceChangedDetail {
  scope: DeviceScope;
  id: string;
  kind: DeviceKind;
  deviceId: string;
}

interface Entry {
  room: Room;
  errorHandler: (failure: unknown, kind?: DeviceKind) => void;
  activeHandler: (kind: DeviceKind, deviceId: string) => void;
  autoRecover: boolean;
  recovering: Set<DeviceKind>;
}

const registry = new Map<string, Entry>();
const key = (scope: DeviceScope, id: string) => `${scope}_${id}`;

const ERROR_EVENT = 'livekit-media-device-error';
const ACTIVE_EVENT = 'livekit-active-device-changed';

function dispatchError(d: DeviceErrorDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<DeviceErrorDetail>(ERROR_EVENT, { detail: d }));
}
function dispatchActive(d: ActiveDeviceChangedDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<ActiveDeviceChangedDetail>(ACTIVE_EVENT, { detail: d }));
}

function classify(err: unknown): { name: string; message: string } {
  if (err instanceof Error) return { name: err.name || 'Error', message: err.message || String(err) };
  return { name: 'UnknownError', message: String(err) };
}

async function tryRecoverDevice(
  room: Room,
  kind: DeviceKind,
): Promise<string | null> {
  try {
    const list = await Room.getLocalDevices(kind, true);
    if (!list || list.length === 0) return null;
    // Pick the first device that's not the one currently failing.
    const local = (room.localParticipant as LocalParticipant | undefined);
    let currentId: string | undefined;
    if (kind === 'audioinput') {
      currentId = local?.audioTrackPublications.values().next().value?.track?.mediaStreamTrack?.getSettings().deviceId as string | undefined;
    } else if (kind === 'videoinput') {
      currentId = local?.videoTrackPublications.values().next().value?.track?.mediaStreamTrack?.getSettings().deviceId as string | undefined;
    }
    const next = list.find((d) => d.deviceId && d.deviceId !== currentId) ?? list[0];
    if (!next?.deviceId) return null;
    await room.switchActiveDevice(kind, next.deviceId);
    return next.deviceId;
  } catch {
    return null;
  }
}

export interface RegisterOpts {
  autoRecover?: boolean;
}

export function registerMediaDeviceHandlers(
  scope: DeviceScope,
  id: string | null | undefined,
  room: Room | null | undefined,
  opts: RegisterOpts = {},
): void {
  if (!id || !room) return;
  unregisterMediaDeviceHandlers(scope, id);

  const entry: Entry = {
    room,
    errorHandler: () => {},
    activeHandler: () => {},
    autoRecover: !!opts.autoRecover,
    recovering: new Set(),
  };

  entry.errorHandler = (failure: unknown, kindHint?: DeviceKind) => {
    // livekit-client passes (MediaDeviceFailure, ?kind?) — kind may be undefined on older versions
    const { name, message } = classify(failure);
    let kind: DeviceKind | 'unknown' = kindHint ?? 'unknown';
    // Try to infer from message if kind missing.
    if (kind === 'unknown') {
      if (/audio/i.test(message)) kind = 'audioinput';
      else if (/video|camera/i.test(message)) kind = 'videoinput';
    }

    let recovered = false;
    if (
      entry.autoRecover &&
      (kind === 'audioinput' || kind === 'videoinput') &&
      !entry.recovering.has(kind) &&
      name !== 'NotAllowedError' &&
      name !== 'SecurityError'
    ) {
      entry.recovering.add(kind);
      tryRecoverDevice(entry.room, kind).then((nextId) => {
        recovered = !!nextId;
        entry.recovering.delete(kind as DeviceKind);
        dispatchError({ scope, id, kind, name, message, recovered });
      });
      return; // Wait for recovery attempt to dispatch.
    }
    dispatchError({ scope, id, kind, name, message, recovered });
  };

  entry.activeHandler = (kind: DeviceKind, deviceId: string) => {
    dispatchActive({ scope, id, kind, deviceId });
  };

  try {
    room.on(RoomEvent.MediaDevicesError, entry.errorHandler as never);
    room.on(RoomEvent.ActiveDeviceChanged, entry.activeHandler as never);
  } catch {
    return;
  }

  registry.set(key(scope, id), entry);
}

export function unregisterMediaDeviceHandlers(
  scope: DeviceScope,
  id: string | null | undefined,
): void {
  if (!id) return;
  const k = key(scope, id);
  const entry = registry.get(k);
  if (!entry) return;
  try {
    entry.room.off(RoomEvent.MediaDevicesError, entry.errorHandler as never);
    entry.room.off(RoomEvent.ActiveDeviceChanged, entry.activeHandler as never);
  } catch {
    /* room may already be disconnected */
  }
  registry.delete(k);
}

export function setMediaDeviceAutoRecover(
  scope: DeviceScope,
  id: string | null | undefined,
  on: boolean,
): void {
  if (!id) return;
  const entry = registry.get(key(scope, id));
  if (entry) entry.autoRecover = on;
}
