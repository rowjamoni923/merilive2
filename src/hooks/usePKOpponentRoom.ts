/**
 * Pkg100: PK Cross-room Audio Bridge — Opponent Room Subscription
 *
 * During an active PK battle, every client (host + viewers) creates a
 * secondary subscribe-only LiveKit connection to the opponent's stream room.
 * This allows both sides to see and hear both hosts without any server-side
 * track forwarding or shared-room migration.
 *
 * Architecture:
 *   Host A  →  Room A (publish+subscribe)  +  Room B (subscribe-only)
 *   Host B  →  Room B (publish+subscribe)  +  Room A (subscribe-only)
 *   Viewers →  Their host's room (sub)    +  Opponent room (subscribe-only)
 *
 * No Supabase Realtime channels. Bounded lifetime = battle ≤180s = max 1 extra
 * LiveKit (Android native) connection per client. Disconnects automatically on PK end.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteParticipant,
  type RemoteTrackPublication,
} from 'livekit-client';
import { getLiveKitToken } from '@/services/livekitService';
import { attachLiveKitTokenRefresh } from '@/lib/livekitTokenRefresh';
import { connectLiveKitRoom } from '@/lib/livekitConnectPolicy';

export interface OpponentRoomTracks {
  /** Opponent's video track (for split-screen rendering) */
  videoTrack: RemoteTrack | null;
  /** Opponent's audio track (auto-played by LiveKit Room) */
  audioTrack: RemoteTrack | null;
  /** The opponent participant object (for metadata like name) */
  participant: RemoteParticipant | null;
  /** True while the secondary room is connecting */
  isConnecting: boolean;
  /** True once connected and at least video or audio is available */
  isConnected: boolean;
  /** Human-readable connection status for UI */
  status: 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
}

export function usePKOpponentRoom(opponentStreamId: string | null) {
  const [tracks, setTracks] = useState<OpponentRoomTracks>({
    videoTrack: null,
    audioTrack: null,
    participant: null,
    isConnecting: false,
    isConnected: false,
    status: 'idle',
  });
  const roomRef = useRef<Room | null>(null);
  // Pkg189: token refresh detach handle.
  const tokenRefreshDetachRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const disconnect = useCallback(() => {
    if (tokenRefreshDetachRef.current) {
      try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
      tokenRefreshDetachRef.current = null;
    }
    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      room.disconnect();
      roomRef.current = null;
    }
    if (mountedRef.current) {
      setTracks({
      });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!opponentStreamId) {
      disconnect();
      return;
    }

    let cancelled = false;

    const connect = async () => {
      if (cancelled) return;
      setTracks((t) => ({ ...t, isConnecting: true, status: 'connecting' }));

      try {
        const roomName = `live_${opponentStreamId}`;
        const tokenData = await getLiveKitToken(
          roomName,
          'viewer_stream', // subscribe-only
          undefined,
          false
        );

        if (cancelled) return;

        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        });
        roomRef.current = room;

        // --- Track subscription handling ---
        const updateHostTracks = () => {
          if (cancelled || !mountedRef.current) return;

          // In a stream room there is exactly one publisher (the host).
          // Find the first participant with camera or mic tracks.
          let hostParticipant: RemoteParticipant | null = null;
          let video: RemoteTrack | null = null;
          let audio: RemoteTrack | null = null;

          for (const p of room.remoteParticipants.values()) {
            for (const pub of p.videoTrackPublications.values()) {
              if (pub.track) {
                hostParticipant = p;
                video = pub.track;
                break;
              }
            }
            for (const pub of p.audioTrackPublications.values()) {
              if (pub.track) {
                hostParticipant = p;
                audio = pub.track;
                break;
              }
            }
            if (hostParticipant) break;
          }

          setTracks({
          });
        };

        room.on(RoomEvent.TrackSubscribed, () => updateHostTracks());
        room.on(RoomEvent.TrackUnsubscribed, () => updateHostTracks());
        room.on(RoomEvent.ParticipantDisconnected, () => updateHostTracks());
        room.on(RoomEvent.Disconnected, () => {
          if (!cancelled && mountedRef.current) {
            setTracks({
            });
          }
        });

        await connectLiveKitRoom(room, tokenData.url, tokenData.token, 'pk-opponent');

        if (cancelled) {
          room.disconnect();
          return;
        }

        // Pkg189: silent token refresh before TTL expiry.
        if (tokenRefreshDetachRef.current) {
          try { tokenRefreshDetachRef.current(); } catch { /* ignore */ }
        }
        const roomNameForRefresh = roomName;
        tokenRefreshDetachRef.current = attachLiveKitTokenRefresh(
          room,
          async () => {
            const fresh = await getLiveKitToken(roomNameForRefresh, 'viewer_stream', undefined, false);
            return { token: fresh.token, url: fresh.url, ttl: fresh.ttl };
          },
          tokenData.ttl ?? 60 * 60 * 6,
          { label: 'lk-pk-opp' }
        );

        // Initial scan after connect
        updateHostTracks();
      } catch (err) {
        console.error('[usePKOpponentRoom] connect failed:', err);
        if (!cancelled && mountedRef.current) {
          setTracks({
          });
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [opponentStreamId, disconnect]);

  return tracks;
}
