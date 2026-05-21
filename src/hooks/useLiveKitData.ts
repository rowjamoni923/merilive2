/**
 * Pkg72: useLiveKitData — singleton DataPacket attach for an existing Room.
 *
 * The page that owns the LiveKit Room (CallProvider / LiveStream / PartyRoom)
 * passes its Room instance here. This hook:
 *   1. Reads the per-feature kill-switch (instant rollback).
 *   2. Subscribes to RoomEvent.DataReceived — decodes envelope, dedupes 400ms,
 *      filters by feature, dispatches to onMessage.
 *   3. Exposes a stable publish(type, payload, opts) that wraps the payload
 *      in the standard envelope and sends via room.localParticipant.publishData.
 *
 * NEVER creates its own Room. NEVER opens a Supabase Realtime channel.
 * NEVER polls. Money path stays Supabase RPC first → publish second.
 */
import { useCallback, useEffect, useRef } from 'react';
import {
  Room,
  RoomEvent,
  DataPacket_Kind,
  type RemoteParticipant,
} from 'livekit-client';
import {
  type LiveKitFeature,
  type SignalEnvelope,
  buildEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  isDuplicateEnvelope,
  isLiveKitEnabled,
  isLiveKitEnabledSync,
} from '@/lib/livekitSignaling';

export interface UseLiveKitDataOptions<T = unknown> {
  /** Existing Room instance owned by the feature page. May be null while connecting. */
  room: Room | null | undefined;
  /** Feature scope — also matches the kill-switch key. */
  feature: LiveKitFeature;
  /** Called for every non-duplicate envelope matching `feature`. */
  onMessage?: (
    env: SignalEnvelope<T>,
    sender: RemoteParticipant | undefined,
  ) => void;
  /** Set false to suspend subscription without unmounting. */
  enabled?: boolean;
}

export interface PublishOptions {
  /** LiveKit reliability tier. Default: RELIABLE (use LOSSY only for high-rate ticks). */
  reliable?: boolean;
  /** Target specific participant identities — omit to broadcast to whole room. */
  destinationIdentities?: string[];
  /** Optional logical topic for LiveKit server-side filtering. */
  topic?: string;
}

export interface UseLiveKitDataReturn {
  /**
   * Publish an envelope. Returns true if sent, false if blocked by kill-switch
   * or room not connected. NEVER throws — callers should never block UI.
   */
  publish: (type: string, payload: unknown, opts?: PublishOptions) => Promise<boolean>;
  /** Synchronous "is the kill-switch ON" — for UI hints only. */
  isEnabled: () => boolean;
}

export function useLiveKitData<T = unknown>(
  options: UseLiveKitDataOptions<T>,
): UseLiveKitDataReturn {
  const { room, feature, onMessage, enabled = true } = options;
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    if (!room || !enabled) return;

    const handler = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: DataPacket_Kind,
      _topic?: string,
    ) => {
      const env = decodeEnvelope(payload);
      if (!env) return;
      if (env.f !== feature) return;
      if (isDuplicateEnvelope(env.id)) return;
      try {
        onMessageRef.current?.(env as SignalEnvelope<T>, participant);
      } catch (err) {
        // Never let a single bad handler crash the room.
        console.warn(`[LiveKit][${feature}] onMessage threw:`, err);
      }
    };

    room.on(RoomEvent.DataReceived, handler);
    return () => {
      room.off(RoomEvent.DataReceived, handler);
    };
  }, [room, feature, enabled]);

  const publish = useCallback<UseLiveKitDataReturn['publish']>(
    async (type, payload, opts) => {
      if (!room) return false;
      if (room.state !== 'connected') return false;

      // Async kill-switch check (cached 10s). For ultra-hot paths the caller
      // can pre-check isEnabled() synchronously — but we always re-check here.
      const allowed = await isLiveKitEnabled(feature);
      if (!allowed) return false;

      const senderId = room.localParticipant?.identity;
      const env = buildEnvelope(feature, type, payload, senderId);
      const bytes = encodeEnvelope(env);

      try {
        await room.localParticipant.publishData(bytes, {
          reliable: opts?.reliable !== false,
          destinationIdentities: opts?.destinationIdentities,
          topic: opts?.topic,
        });
        return true;
      } catch (err) {
        console.warn(`[LiveKit][${feature}] publish failed:`, err);
        return false;
      }
    },
    [room, feature],
  );

  const isEnabled = useCallback(() => isLiveKitEnabledSync(feature), [feature]);

  return { publish, isEnabled };
}
