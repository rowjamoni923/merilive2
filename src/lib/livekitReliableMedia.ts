import { Room, Track, type LocalTrackPublication } from 'livekit-client';

type VideoProcessor = (track: MediaStreamTrack) => Promise<MediaStreamTrack>;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
};

const VIDEO_CONSTRAINTS: MediaTrackConstraints[] = [
  { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
  { facingMode: { ideal: 'user' }, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24 } },
  { facingMode: { ideal: 'user' }, frameRate: { ideal: 24 } },
  { facingMode: 'user' },
  true as unknown as MediaTrackConstraints,
];

const isLive = (track?: MediaStreamTrack | null) => !!track && track.readyState === 'live';

const hasLocalTrack = (room: Room, kind: Track.Kind, source: Track.Source) =>
  Array.from(room.localParticipant.trackPublications.values()).some(
    (pub) => pub.kind === kind && pub.source === source && isLive(pub.track?.mediaStreamTrack),
  );

const markVideoTrack = (track: MediaStreamTrack) => {
  try { if ('contentHint' in track) (track as any).contentHint = 'motion'; } catch { /* ignore */ }
};

const getUserMediaAttempt = (constraints: MediaStreamConstraints) =>
  navigator.mediaDevices.getUserMedia(constraints);

async function createFallbackStream(needVideo: boolean, needAudio: boolean): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera/microphone is not supported on this device.');
  }

  let lastError: unknown = null;
  const streams: MediaStream[] = [];

  if (needVideo) {
    for (const video of VIDEO_CONSTRAINTS) {
      try {
        const stream = await getUserMediaAttempt({ video, audio: needAudio ? AUDIO_CONSTRAINTS : false });
        if (stream.getVideoTracks().some(isLive)) return stream;
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (needVideo) {
    for (const video of VIDEO_CONSTRAINTS) {
      try {
        const stream = await getUserMediaAttempt({ video, audio: false });
        if (stream.getVideoTracks().some(isLive)) {
          streams.push(stream);
          break;
        }
        stream.getTracks().forEach((track) => track.stop());
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (needAudio) {
    try {
      streams.push(await getUserMediaAttempt({ video: false, audio: AUDIO_CONSTRAINTS }));
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
  const stream = preparedStream?.getTracks().some(isLive)
    ? preparedStream
    : await createFallbackStream(needVideo, needAudio);

  let videoPublication: LocalTrackPublication | undefined;
  let audioPublication: LocalTrackPublication | undefined;

  if (needVideo && !hasLocalTrack(room, Track.Kind.Video, Track.Source.Camera)) {
    const sourceVideo = stream.getVideoTracks().find(isLive);
    if (!sourceVideo) throw new Error('Camera track missing after permission was granted.');
    markVideoTrack(sourceVideo);
    const finalVideo = processVideoTrack ? await processVideoTrack(sourceVideo) : sourceVideo;
    markVideoTrack(finalVideo);
    videoPublication = await room.localParticipant.publishTrack(finalVideo as any, { source: Track.Source.Camera } as any);
  }

  if (needAudio && !hasLocalTrack(room, Track.Kind.Audio, Track.Source.Microphone)) {
    const audio = stream.getAudioTracks().find(isLive);
    if (!audio) throw new Error('Microphone track missing after permission was granted.');
    audioPublication = await room.localParticipant.publishTrack(audio as any, { source: Track.Source.Microphone } as any);
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