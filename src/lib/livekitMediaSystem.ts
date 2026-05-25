import { Room, RoomEvent, type RemoteTrack, type RemoteTrackPublication } from 'livekit-client';

export type LiveKitMediaScope = 'live' | 'party' | 'call';

const audioElementsByKey = new Map<string, HTMLAudioElement>();
const roomPrimeCleanups = new WeakMap<Room, () => void>();

export function getLiveKitRemoteAudioKey(
  scope: LiveKitMediaScope,
  participantIdentity: string,
  publication?: RemoteTrackPublication | null,
  track?: RemoteTrack | null,
): string {
  return `${scope}:${participantIdentity}:${publication?.trackSid || (publication as any)?.sid || (track as any)?.sid || track?.mediaStreamTrack?.id || 'audio'}`;
}

export function attachLiveKitRemoteAudioOnce({
  scope,
  key,
  track,
  muted = false,
  volume = 1,
}: {
  scope: LiveKitMediaScope;
  key: string;
  track: RemoteTrack;
  muted?: boolean;
  volume?: number;
}): HTMLAudioElement | null {
  const existing = audioElementsByKey.get(key);
  if (existing?.isConnected) {
    existing.muted = muted;
    existing.volume = volume;
    existing.play().catch(() => {});
    return existing;
  }

  if (existing) audioElementsByKey.delete(key);

  let audioEl: HTMLAudioElement;
  try {
    audioEl = track.attach() as HTMLAudioElement;
  } catch {
    return null;
  }

  audioEl.dataset.livekitMedia = 'true';
  audioEl.dataset.livekitAudioKey = key;
  audioEl.dataset.livekitRemoteAudio = scope;
  audioEl.autoplay = true;
  audioEl.muted = muted;
  audioEl.volume = volume;
  audioEl.style.display = 'none';
  try { audioEl.setAttribute('playsinline', 'true'); } catch { /* ignore */ }
  try { audioEl.setAttribute('webkit-playsinline', 'true'); } catch { /* ignore */ }
  try { (audioEl as any).webkitPlaysInline = true; } catch { /* ignore */ }
  try { document.body.appendChild(audioEl); } catch { /* ignore */ }
  audioEl.play().catch(() => {});
  audioElementsByKey.set(key, audioEl);
  return audioEl;
}

export function detachLiveKitRemoteAudio(key: string): void {
  const el = audioElementsByKey.get(key);
  if (el) {
    try { el.pause(); } catch { /* ignore */ }
    try { (el as any).srcObject = null; } catch { /* ignore */ }
    try { el.remove(); } catch { /* ignore */ }
  }
  audioElementsByKey.delete(key);
}

export function detachLiveKitRemoteAudioByPrefix(prefix: string): void {
  Array.from(audioElementsByKey.keys())
    .filter((key) => key.startsWith(prefix))
    .forEach(detachLiveKitRemoteAudio);
}

export function primeLiveKitRoomMedia(room: Room): void {
  if (typeof window === 'undefined') return;
  if (roomPrimeCleanups.has(room)) return;

  const start = () => {
    try {
      room.startAudio()
        .catch(() => {})
        .finally(() => {
          audioElementsByKey.forEach((el) => {
            try { el.play().catch(() => {}); } catch { /* ignore */ }
          });
        });
    } catch { /* ignore */ }
  };
  const onStatus = () => start();
  const cleanup = () => {
    try { room.off(RoomEvent.AudioPlaybackStatusChanged, onStatus); } catch { /* ignore */ }
    window.removeEventListener('pointerdown', start, true);
    window.removeEventListener('touchend', start, true);
    window.removeEventListener('click', start, true);
    roomPrimeCleanups.delete(room);
  };

  roomPrimeCleanups.set(room, cleanup);
  room.on(RoomEvent.AudioPlaybackStatusChanged, onStatus);
  room.once(RoomEvent.Disconnected, cleanup);
  window.addEventListener('pointerdown', start, { passive: true, capture: true });
  window.addEventListener('touchend', start, { passive: true, capture: true });
  window.addEventListener('click', start, { passive: true, capture: true });
  start();
}
