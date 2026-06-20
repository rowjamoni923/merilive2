interface PreparedHostPreviewMedia {
  stream: MediaStream;
  preparedAt: number;
  consumed: boolean;
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
    consumed: false,
  };
};

export const consumePreparedHostPreviewStream = (): MediaStream | null => {
  const prepared = preparedHostPreviewMedia;

  if (!prepared) return null;
  if (isExpired(prepared.preparedAt) || !isStreamUsable(prepared.stream)) {
    preparedHostPreviewMedia = null;
    return null;
  }

  // Mark as consumed but keep the reference temporarily so React StrictMode/HMR
  // can read the same prepared stream on a second render without losing the
  // preview. Once consumed, later `clear(..., stopTracks:true)` must never stop
  // these tracks because LiveStream may already be rendering/publishing them.
  prepared.consumed = true;
  return prepared.stream;
};

export const clearPreparedHostPreviewStream = (options?: { stopTracks?: boolean }) => {
  const shouldStopTracks = options?.stopTracks === true;
  const prepared = preparedHostPreviewMedia;
  preparedHostPreviewMedia = null;

  if (shouldStopTracks && prepared?.stream && !prepared.consumed) {
    prepared.stream.getTracks().forEach((track) => track.stop());
  }
};
