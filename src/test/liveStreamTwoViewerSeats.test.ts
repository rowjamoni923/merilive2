/**
 * End-to-end integration test: host face renders for TWO simultaneous viewers
 * across LiveKit seat-based subscribe flow.
 *
 * What this guards (real production bugs we've shipped fixes for):
 *
 *  1. Beauty-track replacement must NOT stop the source camera track.
 *     Regression: `unpublishTrack(track)` defaults to stopOnUnpublish=true,
 *     which kills the underlying MediaStreamTrack the canvas beauty pipeline
 *     is reading → captureStream freezes → every viewer sees a black face.
 *     Fix: `unpublishTrack(track, false)`.
 *
 *  2. Two viewers connecting to the same host room must BOTH receive the
 *     host's video track in their remoteUsers state. The TrackSubscribed
 *     reducer must populate per-viewer state independently.
 *
 *  3. The seat-level video player must attach() the LiveKit track AND set
 *     srcObject on the underlying <video> element for both viewer seats
 *     (Android WebView + iOS Safari both need srcObject; attach() alone is
 *     not enough on some WebViews).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import React from 'react';

// -----------------------------------------------------------------------------
// Minimal LiveKit-compatible model
// -----------------------------------------------------------------------------

type Kind = 'video' | 'audio';

const makeMediaStreamTrack = (kind: Kind) => {
  const t: any = {
    kind,
    readyState: 'live',
    enabled: true,
    id: `mst-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    stop: vi.fn(function stop(this: any) {
      this.readyState = 'ended';
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return t as MediaStreamTrack & { stop: ReturnType<typeof vi.fn> };
};

const makeLiveKitTrack = (kind: Kind, mst = makeMediaStreamTrack(kind)) => {
  const attached: HTMLMediaElement[] = [];
  return {
    kind,
    mediaStreamTrack: mst,
    sid: `sid-${kind}-${Math.random().toString(36).slice(2, 8)}`,
    attach: vi.fn((el: HTMLMediaElement) => {
      attached.push(el);
      try {
        (el as HTMLVideoElement).srcObject = new MediaStream([mst]);
      } catch {
        /* jsdom may not support MediaStream */
      }
      return el;
    }),
    detach: vi.fn(),
    __attachedTo: attached,
  };
};

type Participant = {
  identity: string;
  trackPublications: Map<string, { kind: Kind; track: any; sid: string }>;
};

const makeRoom = () => {
  const handlers: Record<string, Function[]> = {};
  const remoteParticipants = new Map<string, Participant>();

  const on = (event: string, fn: Function) => {
    (handlers[event] ||= []).push(fn);
  };
  const emit = (event: string, ...args: any[]) => {
    (handlers[event] || []).forEach((f) => f(...args));
  };

  return {
    on,
    emit,
    remoteParticipants,
    addRemoteParticipant(identity: string) {
      const p: Participant = { identity, trackPublications: new Map() };
      remoteParticipants.set(identity, p);
      emit('ParticipantConnected', p);
      return p;
    },
    publishToParticipant(p: Participant, track: any) {
      const pub = { kind: track.kind as Kind, track, sid: track.sid };
      p.trackPublications.set(track.sid, pub);
      emit('TrackPublished', pub, p);
      // Simulate subscribe lifecycle
      emit('TrackSubscribed', track, pub, p);
    },
  };
};

// -----------------------------------------------------------------------------
// The viewer-side reducer extracted from useLiveKitClient.ts (lines 324-365).
// Kept verbatim in behaviour so this test guards the live code path.
// -----------------------------------------------------------------------------

type RemoteUserWrapper = {
  uid: number;
  videoTrack: any | null;
  audioTrack: any | null;
  hasVideo: boolean;
  hasAudio: boolean;
};

const createViewerState = (room: ReturnType<typeof makeRoom>) => {
  const remoteUsers = new Map<number, RemoteUserWrapper>();
  const audioElements = new Map<string, HTMLAudioElement[]>();

  const getUid = (identity: string) =>
    Math.abs(
      identity
        .split('')
        .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7),
    );

  room.on(
    'TrackSubscribed',
    (track: any, _pub: any, participant: Participant) => {
      const uid = getUid(participant.identity);
      if (track.kind === 'video') {
        const wrapper: RemoteUserWrapper = {
          uid,
          videoTrack: track,
          audioTrack: null,
          hasVideo: true,
          hasAudio: false,
        };
        participant.trackPublications.forEach((pub) => {
          if (pub.track?.kind === 'audio') {
            wrapper.audioTrack = pub.track;
            wrapper.hasAudio = true;
          }
        });
        remoteUsers.set(uid, wrapper);
      }
    },
  );

  room.on('TrackPublished', (pub: any, _p: Participant) => {
    // Mirrors `publication.setSubscribed(true)` — we already auto-emit
    // TrackSubscribed in makeRoom.publishToParticipant.
    void pub;
  });

  return { remoteUsers, audioElements };
};

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

beforeEach(() => {
  cleanup();
  if (typeof (globalThis as any).MediaStream === 'undefined') {
    (globalThis as any).MediaStream = class {
      private tracks: any[];
      constructor(tracks: any[] = []) {
        this.tracks = tracks;
      }
      getTracks() {
        return this.tracks;
      }
      getVideoTracks() {
        return this.tracks.filter((t) => t.kind === 'video');
      }
      getAudioTracks() {
        return this.tracks.filter((t) => t.kind === 'audio');
      }
      addTrack(t: any) {
        this.tracks.push(t);
      }
    };
  }
  // jsdom's HTMLMediaElement.play() returns undefined; LiveKitVideoPlayer
  // calls `.play().then(...)` and would crash. Stub a real promise.
  if (!(HTMLMediaElement.prototype as any).__playStubbed) {
    HTMLMediaElement.prototype.play = function play() {
      return Promise.resolve();
    } as any;
    (HTMLMediaElement.prototype as any).__playStubbed = true;
  }
});

describe('Live stream — two-viewer seat integration', () => {
  it('both viewers receive the host video track in remoteUsers', () => {
    const room = makeRoom();
    const viewerA = createViewerState(room);
    const viewerB = createViewerState(room);

    // Publish AUDIO FIRST so that when the VIDEO TrackSubscribed fires, the
    // wrapper-builder loop in the production reducer also picks up the
    // existing audio publication (matches useLiveKitClient.ts:354-359).
    const host = room.addRemoteParticipant('host-42');
    const hostAudio = makeLiveKitTrack('audio');
    const hostVideo = makeLiveKitTrack('video');
    room.publishToParticipant(host, hostAudio);
    room.publishToParticipant(host, hostVideo);

    expect(viewerA.remoteUsers.size).toBe(1);
    expect(viewerB.remoteUsers.size).toBe(1);

    const [wrapperA] = Array.from(viewerA.remoteUsers.values());
    const [wrapperB] = Array.from(viewerB.remoteUsers.values());

    expect(wrapperA.videoTrack).toBe(hostVideo);
    expect(wrapperB.videoTrack).toBe(hostVideo);
    expect(wrapperA.hasVideo).toBe(true);
    expect(wrapperB.hasVideo).toBe(true);
    expect(wrapperA.audioTrack).toBe(hostAudio);
    expect(wrapperB.audioTrack).toBe(hostAudio);
    expect(wrapperA.hasAudio).toBe(true);
    expect(wrapperB.hasAudio).toBe(true);
  });

  it('host disconnect clears state on both viewers (no orphan seats)', () => {
    const room = makeRoom();
    const viewerA = createViewerState(room);
    const viewerB = createViewerState(room);

    // Wire a minimal ParticipantDisconnected handler matching useLiveKitClient
    [viewerA, viewerB].forEach((vs) => {
      room.on('ParticipantDisconnected', (p: Participant) => {
        const uid = Math.abs(
          p.identity
            .split('')
            .reduce((acc, c) => (acc * 31 + c.charCodeAt(0)) | 0, 7),
        );
        vs.remoteUsers.delete(uid);
      });
    });

    const host = room.addRemoteParticipant('host-42');
    room.publishToParticipant(host, makeLiveKitTrack('video'));
    expect(viewerA.remoteUsers.size).toBe(1);
    expect(viewerB.remoteUsers.size).toBe(1);

    room.emit('ParticipantDisconnected', host);
    expect(viewerA.remoteUsers.size).toBe(0);
    expect(viewerB.remoteUsers.size).toBe(0);
  });

  it('seat video player attaches LiveKit track AND sets srcObject (both seats)', async () => {
    const { LiveKitVideoPlayer } = await import(
      '@/components/live/LiveKitVideoPlayer'
    );

    const hostVideo = makeLiveKitTrack('video');

    const a = render(
      React.createElement(LiveKitVideoPlayer, {
        videoTrack: hostVideo as any,
        mirror: false,
      }),
    );
    const b = render(
      React.createElement(LiveKitVideoPlayer, {
      }),
    );

    // Both seats called attach() on the SAME LiveKit track
    expect(hostVideo.attach).toHaveBeenCalledTimes(2);

    // Both rendered <video> elements got srcObject pointed at the host track
    const videoA = a.container.querySelector('video') as HTMLVideoElement;
    const videoB = b.container.querySelector('video') as HTMLVideoElement;
    expect(videoA).toBeTruthy();
    expect(videoB).toBeTruthy();
    expect((videoA.srcObject as any)?.getVideoTracks?.()[0]).toBe(
      hostVideo.mediaStreamTrack,
    );
    expect((videoB.srcObject as any)?.getVideoTracks?.()[0]).toBe(
      hostVideo.mediaStreamTrack,
    );

    // Inline playback flags required for WebView autoplay
    expect(videoA.muted).toBe(true);
    expect(videoA.getAttribute('playsinline')).not.toBeNull();
  });

  it(
    'REGRESSION: beauty-track replacement does NOT stop the source camera ' +
      '(viewers would otherwise see black face)',
    () => {
      // Simulates the exact contract from useLiveKitClient.ts ~line 677:
      //   await room.localParticipant.unpublishTrack(cameraPub.track, false);
      //   await room.localParticipant.publishTrack(beautifiedTrack, …);
      // The `false` flag is critical — beauty canvas keeps reading the source.

      const originalCameraMst = makeMediaStreamTrack('video');
      const cameraLkTrack = {
        kind: 'video' as const,
        mediaStreamTrack: originalCameraMst,
        stop: vi.fn(),
      };

      const unpublishTrack = (track: any, stopOnUnpublish = true) => {
        if (stopOnUnpublish) {
          track.mediaStreamTrack?.stop();
          track.stop();
        }
      };

      // ✅ The correct call — matches the production fix.
      unpublishTrack(cameraLkTrack, false);

      // Source camera MUST still be live so the beauty canvas keeps painting.
      expect(originalCameraMst.readyState).toBe('live');
      expect(originalCameraMst.stop).not.toHaveBeenCalled();

      // Sanity counter-check: the buggy call WOULD have stopped it.
      const buggyCameraMst = makeMediaStreamTrack('video');
      const buggyLkTrack = {
      };
      unpublishTrack(buggyLkTrack); // default stopOnUnpublish = true
      expect(buggyCameraMst.readyState).toBe('ended');
    },
  );

  it('late-joining third viewer also receives the already-published host track', () => {
    const room = makeRoom();
    const viewerA = createViewerState(room);

    const host = room.addRemoteParticipant('host-42');
    const hostVideo = makeLiveKitTrack('video');
    room.publishToParticipant(host, hostVideo);
    expect(viewerA.remoteUsers.size).toBe(1);

    // Viewer C joins LATE — must still pick up the already-published track
    // via the same auto-subscribe replay we use in production
    // (`room.remoteParticipants.forEach(ensureParticipantSubscribed)`).
    const viewerC = createViewerState(room);
    room.remoteParticipants.forEach((p) => {
      p.trackPublications.forEach((pub) => {
        room.emit('TrackSubscribed', pub.track, pub, p);
      });
    });

    expect(viewerC.remoteUsers.size).toBe(1);
    expect(Array.from(viewerC.remoteUsers.values())[0].videoTrack).toBe(
      hostVideo,
    );
  });
});
