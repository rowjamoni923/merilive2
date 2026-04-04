interface PreparedHostPreviewMedia {
  stream: MediaStream;
  preparedAt: number;
}

const PREVIEW_TTL_MS = 45_000;

let preparedHostPreviewMedia: PreparedHostPreviewMedia | null = null;

const isStreamUsable = (stream: MediaStream | null | undefined) => {
  if (!stream) return false;
  return stream.getTracks().some((track) => track.readyState === 'live');
};

const isExpired = (preparedAt: number) => Date.now() - preparedAt > PREVIEW_TTL_MS;

export const setPreparedHostPreviewStream = (stream: MediaStream | null) => {
  if (!isStreamUsable(stream)) {
    preparedHostPreviewMedia = null;
    return;
  }

  preparedHostPreviewMedia = {
    stream,
    preparedAt: Date.now(),
  };
};

export const consumePreparedHostPreviewStream = (): MediaStream | null => {
  const prepared = preparedHostPreviewMedia;
  preparedHostPreviewMedia = null;

  if (!prepared) return null;
  if (isExpired(prepared.preparedAt)) return null;
  if (!isStreamUsable(prepared.stream)) return null;

  return prepared.stream;
};

export const clearPreparedHostPreviewStream = (options?: { stopTracks?: boolean }) => {
  const shouldStopTracks = options?.stopTracks === true;
  const prepared = preparedHostPreviewMedia;
  preparedHostPreviewMedia = null;

  if (shouldStopTracks && prepared?.stream) {
    prepared.stream.getTracks().forEach((track) => track.stop());
  }
};
