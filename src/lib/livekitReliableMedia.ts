import { Room, Track, type LocalTrackPublication } from 'livekit-client';
import { claimAndroidWebViewCameraForStream } from '@/lib/androidCameraHandoff';
import { isNativeAndroidApp } from '@/utils/nativeUtils';
import { peekCameraSession } from '@/lib/persistentCameraSession';
import { enforcePermanentCameraLock } from '@/utils/cameraLock';
import { buildPortraitVideoFallbacks, stopMediaStream } from '@/utils/portraitCameraConstraints';


type VideoProcessor = (track: MediaStreamTrack) => Promise<MediaStreamTrack>;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
};

const PORTRAIT_VIDEO_CONSTRAINTS: MediaTrackConstraints[] = buildPortraitVideoFallbacks({ facingMode: 'user' });
const VIDEO_CONSTRAINTS: MediaTrackConstraints[] = [
  ...PORTRAIT_VIDEO_CONSTRAINTS,
];

const isLive = (track?: MediaStreamTrack | null) => !!track && track.readyState === 'live';

const mergeUniqueLiveTracks = (...groups: MediaStreamTrack[][]) => {
  const seen = new Set<string>();
  const tracks: MediaStreamTrack[] = [];
  groups.flat().forEach((track) => {
    if (!isLive(track) || seen.has(track.id)) return;
    seen.add(track.id);
    tracks.push(track);
  });
  return tracks;
};

const hasLocalTrack = (room: Room, kind: Track.Kind, source: Track.Source) =>
  Array.from(room.localParticipant.trackPublications.values()).some(
    (pub) => pub.kind === kind && pub.source === source && isLive(pub.track?.mediaStreamTrack),
  );

const markVideoTrack = (track: MediaStreamTrack) => {
  try { if ('contentHint' in track) (track as any).contentHint = 'motion'; } catch { /* ignore */ }
};

const getUserMediaAttempt = (constraints: MediaStreamConstraints, reason: string) =>
  claimAndroidWebViewCameraForStream(() => navigator.mediaDevices.getUserMedia(constraints), reason);

async function createFallbackStream(needVideo: boolean, needAudio: boolean): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera/microphone is not supported on this device.');
  }

  let lastError: unknown = null;
  const streams: MediaStream[] = [];

  if (needVideo) {
    for (const video of VIDEO_CONSTRAINTS) {
      try {
        const stream = await getUserMediaAttempt({ video, audio: needAudio ? AUDIO_CONSTRAINTS : false }, 'livekit-reliable:combined');
        if (stream.getVideoTracks().some(isLive)) {
          await enforcePermanentCameraLock(stream, 'livekit-reliable:combined');
          return stream;
        }
        stopMediaStream(stream);
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (needVideo) {
    for (const video of VIDEO_CONSTRAINTS) {
      try {
        const stream = await getUserMediaAttempt({ video, audio: false }, 'livekit-reliable:video');
        if (stream.getVideoTracks().some(isLive)) {
          await enforcePermanentCameraLock(stream, 'livekit-reliable:video');
          streams.push(stream);
          break;
        }
        stopMediaStream(stream);
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (needAudio) {
    try {
      streams.push(await navigator.mediaDevices.getUserMedia({ video: false, audio: AUDIO_CONSTRAINTS }));
    } catch (error) {
      lastError = error;
    }
  }

  const tracks = streams.flatMap((stream) => stream.getTracks()).filter(isLive);
  const hasVideo = !needVideo || tracks.some((track) => track.kind === 'video');
  const hasAudio = !needAudio || tracks.some((track) => track.kind === 'audio');
  if (hasVideo && hasAudio && tracks.length > 0) return new MediaStream(tracks);

  tracks.forEach((track) => track.stop());
  throw lastError instanceof Error ? lastError : new Error('Unable to start camera or microphone.');
}

export async function publishReliableLocalMedia(
  room: Room,
  options: {
    needVideo: boolean;
    needAudio: boolean;
    preparedStream?: MediaStream | null;
    processVideoTrack?: VideoProcessor;
  },
): Promise<{ localStream: MediaStream; videoPublication?: LocalTrackPublication; audioPublication?: LocalTrackPublication }> {
  const { needVideo, needAudio, preparedStream, processVideoTrack } = options;
  // Native Android owns the camera/mic via LiveKitPlugin — never run WebView
  // getUserMedia here. Live/Party/Call hooks already throw `native_livekit_required`
  // before reaching this path on Android, but fail-closed for safety.
  if (isNativeAndroidApp()) {
    throw new Error('native_livekit_required');
  }

  const preparedTracks = preparedStream?.getTracks().filter(isLive) ?? [];
  // Step 1d: if the direct handoff stream was missed during route/render
  // timing, still reuse the global warm camera session before opening a new
  // getUserMedia capture. This is the professional GoLive → room continuity
  // path and prevents the host from landing on "Camera not visible" while a
  // perfectly live preview track is already available.
  const warmTracks = peekCameraSession()?.getTracks().filter(isLive) ?? [];
  const candidateTracks = mergeUniqueLiveTracks(preparedTracks, warmTracks);
  const preparedHasVideo = candidateTracks.some((track) => track.kind === 'video');
  const preparedHasAudio = candidateTracks.some((track) => track.kind === 'audio');
  const fallbackStream = (!candidateTracks.length || (needVideo && !preparedHasVideo) || (needAudio && !preparedHasAudio))
    ? await createFallbackStream(needVideo && !preparedHasVideo, needAudio && !preparedHasAudio)
    : null;
  const stream = new MediaStream([
    ...candidateTracks,
    ...(fallbackStream?.getTracks().filter(isLive) ?? []),
  ]);

  let videoPublication: LocalTrackPublication | undefined;
  let audioPublication: LocalTrackPublication | undefined;

  if (needVideo) {
    const existingVideo = Array.from(room.localParticipant.trackPublications.values())
      .find((pub) => pub.kind === Track.Kind.Video && pub.source === Track.Source.Camera);
    
    if (existingVideo && isLive(existingVideo.track?.mediaStreamTrack)) {
      videoPublication = existingVideo as LocalTrackPublication;
    } else {
      const sourceVideo = stream.getVideoTracks().find(isLive);
      if (!sourceVideo) throw new Error('Camera track missing after permission was granted.');
      markVideoTrack(sourceVideo);
      const finalVideo = processVideoTrack ? await processVideoTrack(sourceVideo) : sourceVideo;
      markVideoTrack(finalVideo);
      videoPublication = await room.localParticipant.publishTrack(finalVideo as any, { source: Track.Source.Camera } as any);
    }
  }

  if (needAudio) {
    const existingAudio = Array.from(room.localParticipant.trackPublications.values())
      .find((pub) => pub.kind === Track.Kind.Audio && pub.source === Track.Source.Microphone);
    
    if (existingAudio && isLive(existingAudio.track?.mediaStreamTrack)) {
      audioPublication = existingAudio as LocalTrackPublication;
    } else {
      const audio = stream.getAudioTracks().find(isLive);
      if (!audio) throw new Error('Microphone track missing after permission was granted.');
      audioPublication = await room.localParticipant.publishTrack(audio as any, { source: Track.Source.Microphone } as any);
    }
  }

  const localStream = new MediaStream();
  room.localParticipant.trackPublications.forEach((pub) => {
    const mediaTrack = pub.track?.mediaStreamTrack;
    if (isLive(mediaTrack)) localStream.addTrack(mediaTrack!);
  });

  const hasVideo = !needVideo || localStream.getVideoTracks().some(isLive);
  const hasAudio = !needAudio || localStream.getAudioTracks().some(isLive);
  if (!hasVideo || !hasAudio) {
    throw new Error(`LiveKit media publish incomplete: video=${hasVideo} audio=${hasAudio}`);
  }

  return { localStream, videoPublication, audioPublication };
}

export function localParticipantStream(room: Room): MediaStream {
  const stream = new MediaStream();
  room.localParticipant.trackPublications.forEach((pub) => {
    const mediaTrack = pub.track?.mediaStreamTrack;
    if (isLive(mediaTrack)) stream.addTrack(mediaTrack!);
  });
  return stream;
}